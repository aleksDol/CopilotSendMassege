from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from telethon.errors import FloodWaitError, RPCError, ServerError, TimedOutError
from telethon.tl.functions.channels import GetFullChannelRequest
from telethon.tl.functions.users import GetFullUserRequest
from telethon.tl.types import PeerChannel, User
from telethon.utils import get_peer_id

from app.crypto import SessionCrypto
from app.db import get_connection
from app.services.auth_flow import WorkerError, mark_error_by_channel
from app.telegram_client import create_client


def _trim_or_none(value: str | None) -> str | None:
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    return trimmed if trimmed else None


def _build_display_name(entity: User) -> str | None:
    full_name = " ".join(part for part in [entity.first_name, entity.last_name] if part).strip()
    return full_name or entity.username or (str(entity.id) if entity.id is not None else None)


async def _load_connected_account_by_telegram_account_id(telegram_account_id: str) -> dict[str, Any]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT
                  ta."id" AS "telegramAccountId",
                  ta."channelAccountId",
                  ta."sessionDataEncrypted",
                  ta."loginStatus",
                  ca."companyId"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ta."id" = %s
                  AND ca."channelType" = 'TELEGRAM'
                LIMIT 1
                ''',
                (telegram_account_id,),
            )
            row = await cur.fetchone()

    if not row:
        raise WorkerError("TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found", 404)
    if row["loginStatus"] not in ("CONNECTED", "ERROR"):
        raise WorkerError("TELEGRAM_NOT_CONNECTED", "Telegram account is not connected", 400)
    if not row.get("sessionDataEncrypted"):
        raise WorkerError("SESSION_MISSING", "Telegram session not found", 400)

    return row


async def _resolve_user_entity(client: Any, telegram_user_id: str | None, username: str | None) -> User:
    candidates: list[Any] = []
    if telegram_user_id:
        if telegram_user_id.lstrip("-").isdigit():
            candidates.append(int(telegram_user_id))
        else:
            candidates.append(telegram_user_id)
    if username:
        normalized_username = username.lstrip("@")
        candidates.append(normalized_username)
        candidates.append(f"@{normalized_username}")

    last_error: Exception | None = None
    for candidate in candidates:
        try:
            entity = await client.get_entity(candidate)
            if isinstance(entity, User):
                return entity
        except Exception as exc:  # pragma: no cover - best effort fallback chain
            last_error = exc
            continue

    if last_error is not None:
        raise last_error
    raise WorkerError("TELEGRAM_USER_NOT_FOUND", "Telegram user not found", 404)


def _build_raw_profile_json(
    *,
    user: User,
    about: str | None,
    linked_channel_id: str | None,
    linked_channel_username: str | None,
    linked_channel_title: str | None,
) -> dict[str, Any]:
    return {
        "user": {
            "id": str(user.id) if user.id is not None else None,
            "username": user.username,
            "firstName": user.first_name,
            "lastName": user.last_name,
            "isBot": bool(getattr(user, "bot", False)),
            "isPremium": bool(getattr(user, "premium", False)),
        },
        "profile": {
            "about": about,
            "linkedChannelId": linked_channel_id,
            "linkedChannelUsername": linked_channel_username,
            "linkedChannelTitle": linked_channel_title,
        },
    }


async def fetch_user_profile(
    *,
    telegram_account_id: str,
    telegram_user_id: str | None,
    username: str | None,
    crypto: SessionCrypto,
) -> dict[str, Any]:
    account_id = _trim_or_none(telegram_account_id)
    user_id = _trim_or_none(telegram_user_id)
    uname = _trim_or_none(username)
    if not account_id:
        raise WorkerError("INVALID_TELEGRAM_ACCOUNT", "telegramAccountId is required", 400)
    if not user_id and not uname:
        raise WorkerError("MISSING_AUTHOR_IDENTITY", "telegramUserId or username is required", 400)

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
            user = await _resolve_user_entity(client, user_id, uname)
            full = await client(GetFullUserRequest(user))
            full_user = getattr(full, "full_user", None)
        except FloodWaitError as exc:
            raise WorkerError(
                "TELEGRAM_LIMITED",
                f"Telegram rate limited. Retry in {max(1, int(exc.seconds))} seconds.",
                429,
                details={"retryAfterSeconds": max(1, int(exc.seconds))},
            ) from exc
        except (ServerError, TimedOutError) as exc:
            raise WorkerError("TELEGRAM_TRANSIENT_ERROR", "Temporary Telegram error. Retry shortly.", 503) from exc
        except RPCError as exc:
            raise WorkerError("TELEGRAM_PROFILE_FETCH_FAILED", f"Telegram profile fetch failed: {exc!s}", 502) from exc

        about = _trim_or_none(getattr(full_user, "about", None))
        linked_channel_username: str | None = None
        linked_channel_title: str | None = None
        linked_channel_description: str | None = None
        linked_channel_id: str | None = None

        personal_channel_id = getattr(full_user, "personal_channel_id", None)
        if personal_channel_id:
            try:
                linked_channel_id = str(get_peer_id(PeerChannel(int(personal_channel_id))))
            except Exception:
                linked_channel_id = str(personal_channel_id)

            try:
                channel_entity = await client.get_entity(PeerChannel(int(personal_channel_id)))
                linked_channel_username = _trim_or_none(getattr(channel_entity, "username", None))
                linked_channel_title = _trim_or_none(getattr(channel_entity, "title", None))
                full_channel = await client(GetFullChannelRequest(channel_entity))
                full_chat = getattr(full_channel, "full_chat", None)
                linked_channel_description = _trim_or_none(getattr(full_chat, "about", None))
            except FloodWaitError as exc:
                raise WorkerError(
                    "TELEGRAM_LIMITED",
                    f"Telegram rate limited. Retry in {max(1, int(exc.seconds))} seconds.",
                    429,
                    details={"retryAfterSeconds": max(1, int(exc.seconds))},
                ) from exc
            except Exception:
                # Linked channel enrichment is best-effort only.
                linked_channel_username = linked_channel_username or None
                linked_channel_title = linked_channel_title or None
                linked_channel_description = linked_channel_description or None

        display_name = _build_display_name(user)
        raw_profile_json = _build_raw_profile_json(
            user=user,
            about=about,
            linked_channel_id=linked_channel_id,
            linked_channel_username=linked_channel_username,
            linked_channel_title=linked_channel_title,
        )

        return {
            "telegramUserId": str(user.id),
            "username": _trim_or_none(user.username),
            "displayName": _trim_or_none(display_name),
            "bio": about,
            "linkedChannelId": linked_channel_id,
            "linkedChannelUsername": linked_channel_username,
            "linkedChannelTitle": linked_channel_title,
            "linkedChannelDescription": linked_channel_description,
            "rawProfileJson": raw_profile_json,
            "fetchedAt": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        await client.disconnect()
