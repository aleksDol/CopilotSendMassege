from __future__ import annotations

import logging
from typing import Any

from telethon.errors import (
    ChannelPrivateError,
    FloodWaitError,
    RPCError,
    ServerError,
    TimedOutError,
    UserAlreadyParticipantError,
    UsernameInvalidError,
    UsernameNotOccupiedError,
)
from telethon.tl.functions.channels import JoinChannelRequest
from telethon.utils import get_peer_id

from app.crypto import SessionCrypto
from app.db import get_connection
from app.services.auth_flow import WorkerError, mark_error_by_channel
from app.services.profile_service import _load_connected_account_by_telegram_account_id
from app.services.sync_service import _resolve_conversation_type
from app.telegram_client import create_client

logger = logging.getLogger("telegram-worker.join")


def _trim_or_none(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


async def _load_catalog_entry(entry_id: str) -> dict[str, Any] | None:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT
                  id,
                  title,
                  telegram_username AS "telegramUsername",
                  telegram_chat_id AS "telegramChatId",
                  status
                FROM source_marketplace_entries
                WHERE id = %s
                LIMIT 1
                ''',
                (entry_id,),
            )
            row = await cur.fetchone()
    return dict(row) if row else None


def _chat_metadata_from_entity(entity: Any) -> dict[str, Any]:
    chat_type = _resolve_conversation_type(entity)
    if chat_type == "direct":
        raise WorkerError("UNSUPPORTED_CHAT_TYPE", "Only public group chats and channels are supported", 400)

    title = getattr(entity, "title", None)
    resolved_username = getattr(entity, "username", None)
    peer_id = str(get_peer_id(entity))

    return {
        "telegramChatId": peer_id,
        "chatTitle": title,
        "chatType": "channel_comments" if chat_type == "channel" else "group",
        "username": resolved_username,
    }


def _joined_response(
    *,
    entity: Any,
    normalized_username: str,
    entry_key: str,
    already_joined: bool = False,
) -> dict[str, Any]:
    metadata = _chat_metadata_from_entity(entity)
    logger.info("Joined: @%s%s", normalized_username, " (already joined)" if already_joined else "")
    return {
        "status": "joined",
        "username": normalized_username,
        "entryId": entry_key,
        "alreadyJoined": already_joined,
        **metadata,
    }


async def join_catalog_entry(
    *,
    telegram_account_id: str,
    entry_id: str,
    crypto: SessionCrypto,
) -> dict[str, Any]:
    account_id = _trim_or_none(telegram_account_id)
    entry_key = _trim_or_none(entry_id)
    if not account_id:
        raise WorkerError("INVALID_TELEGRAM_ACCOUNT", "telegramAccountId is required", 400)
    if not entry_key:
        raise WorkerError("INVALID_CATALOG_ENTRY", "entryId is required", 400)

    entry = await _load_catalog_entry(entry_key)
    if not entry:
        raise WorkerError("CATALOG_ENTRY_NOT_FOUND", "Catalog entry not found", 404)
    if entry.get("status") != "active":
        logger.warning(
            "join-catalog-entry invalid: entry=%s reason=inactive_status status=%s",
            entry_key,
            entry.get("status"),
        )
        return {"status": "invalid", "reason": "inactive_status", "entryId": entry_key}

    username = _trim_or_none(entry.get("telegramUsername"))
    if not username:
        logger.warning("join-catalog-entry invalid: entry=%s reason=missing_username", entry_key)
        return {"status": "invalid", "reason": "missing_username", "entryId": entry_key}

    normalized_username = username.lstrip("@")
    account = await _load_connected_account_by_telegram_account_id(account_id)
    session = crypto.decrypt(account["sessionDataEncrypted"])
    client = create_client(session)

    try:
        await client.connect()
        if not await client.is_user_authorized():
            await mark_error_by_channel(
                str(account["companyId"]),
                str(account["channelAccountId"]),
                "Telegram session expired, reconnect required",
                "RECONNECT_REQUIRED",
            )
            raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

        try:
            entity = await client.get_entity(normalized_username)
        except FloodWaitError as exc:
            logger.warning(
                "join-catalog-entry flood-wait: @%s entry=%s seconds=%s",
                normalized_username,
                entry_key,
                exc.seconds,
            )
            raise WorkerError(
                "TELEGRAM_FLOOD_WAIT",
                f"Telegram flood wait: {exc.seconds}s",
                429,
                details={"seconds": int(exc.seconds)},
            ) from exc
        except ChannelPrivateError:
            logger.warning("join-catalog-entry private: @%s entry=%s", normalized_username, entry_key)
            return {"status": "private", "username": normalized_username, "entryId": entry_key}
        except (UsernameInvalidError, UsernameNotOccupiedError) as exc:
            logger.warning(
                "join-catalog-entry invalid: @%s entry=%s error=%s",
                normalized_username,
                entry_key,
                exc,
            )
            return {"status": "invalid", "username": normalized_username, "entryId": entry_key}
        except (ServerError, TimedOutError) as exc:
            raise WorkerError("TELEGRAM_TRANSIENT_ERROR", "Temporary Telegram error. Retry shortly.", 503) from exc
        except RPCError as exc:
            logger.warning(
                "join-catalog-entry invalid: @%s entry=%s rpc_error=%s",
                normalized_username,
                entry_key,
                exc,
            )
            return {"status": "invalid", "username": normalized_username, "entryId": entry_key}

        try:
            await client(JoinChannelRequest(entity))
        except UserAlreadyParticipantError:
            return _joined_response(
                entity=entity,
                normalized_username=normalized_username,
                entry_key=entry_key,
                already_joined=True,
            )
        except FloodWaitError as exc:
            logger.warning(
                "join-catalog-entry flood-wait: @%s entry=%s seconds=%s",
                normalized_username,
                entry_key,
                exc.seconds,
            )
            raise WorkerError(
                "TELEGRAM_FLOOD_WAIT",
                f"Telegram flood wait: {exc.seconds}s",
                429,
                details={"seconds": int(exc.seconds)},
            ) from exc
        except ChannelPrivateError:
            logger.warning("join-catalog-entry private: @%s entry=%s", normalized_username, entry_key)
            return {"status": "private", "username": normalized_username, "entryId": entry_key}
        except RPCError as exc:
            message = str(exc).lower()
            if "already" in message and "participant" in message:
                return _joined_response(
                    entity=entity,
                    normalized_username=normalized_username,
                    entry_key=entry_key,
                    already_joined=True,
                )
            logger.warning(
                "join-catalog-entry invalid: @%s entry=%s rpc_error=%s",
                normalized_username,
                entry_key,
                exc,
            )
            return {"status": "invalid", "username": normalized_username, "entryId": entry_key}

        return _joined_response(
            entity=entity,
            normalized_username=normalized_username,
            entry_key=entry_key,
        )
    finally:
        await client.disconnect()
