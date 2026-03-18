from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import psycopg
from telethon.tl.types import Channel, User

from app.config import settings
from app.crypto import SessionCrypto
from app.db import get_connection
from app.internal_api_client import push_message_event
from app.services.auth_flow import WorkerError, mark_error_by_channel
from app.telegram_client import create_client


@dataclass
class SyncResult:
    dialogs_synced: int = 0
    messages_synced: int = 0


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_conversation_type(entity: Any) -> str:
    if isinstance(entity, Channel):
        return "group" if getattr(entity, "megagroup", False) else "channel"
    return "direct"


async def list_connected_accounts() -> list[dict[str, Any]]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT
                  ca."companyId",
                  ta."channelAccountId"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."channelType" = 'TELEGRAM'
                  AND ta."loginStatus" IN ('CONNECTED', 'ERROR', 'RECONNECT_REQUIRED')
                  AND ta."sessionDataEncrypted" IS NOT NULL
                '''
            )
            rows = await cur.fetchall()
    return rows or []


async def _load_connected_account(
    conn: psycopg.AsyncConnection, company_id: str, channel_account_id: str
) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(
            '''
            SELECT
              ta."id" AS "telegramAccountId",
              ta."channelAccountId",
              ta."sessionDataEncrypted",
              ta."loginStatus",
              ta."telegramUserId"
            FROM "TelegramAccount" ta
            JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
            WHERE ca."companyId" = %s
              AND ta."channelAccountId" = %s
              AND ca."channelType" = 'TELEGRAM'
            LIMIT 1
            ''',
            (company_id, channel_account_id),
        )
        account = await cur.fetchone()

    if not account:
        raise WorkerError("TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found for workspace", 404)

    if account["loginStatus"] not in ("CONNECTED", "ERROR"):
        raise WorkerError("TELEGRAM_NOT_CONNECTED", "Telegram account is not connected", 400)

    if not account.get("sessionDataEncrypted"):
        raise WorkerError("SESSION_MISSING", "Telegram session not found", 400)

    return account


async def _set_sync_markers(
    conn: psycopg.AsyncConnection, telegram_account_id: str, channel_account_id: str
) -> None:
    now = _now()
    async with conn.cursor() as cur:
        await cur.execute(
            '''
            UPDATE "TelegramAccount"
            SET "lastSyncAt" = %s, "lastEventAt" = %s, "errorMessage" = NULL,
                "loginStatus" = 'CONNECTED', "updatedAt" = %s
            WHERE "id" = %s
            ''',
            (now, now, now, telegram_account_id),
        )
        await cur.execute(
            '''
            UPDATE "ChannelAccount"
            SET "status" = 'ACTIVE', "updatedAt" = %s
            WHERE "id" = %s
            ''',
            (now, channel_account_id),
        )


async def run_initial_sync(
    company_id: str,
    channel_account_id: str,
    dialogs_limit: int | None,
    messages_per_dialog: int | None,
    crypto: SessionCrypto,
) -> SyncResult:
    async with get_connection() as conn:
        account = await _load_connected_account(conn, company_id, channel_account_id)
        session = crypto.decrypt(account["sessionDataEncrypted"])

        client = create_client(session)
        result = SyncResult()
        dialogs_cap = dialogs_limit or settings.telegram_initial_dialog_limit
        messages_cap = messages_per_dialog or settings.telegram_initial_messages_per_dialog

        try:
            await client.connect()

            if not await client.is_user_authorized():
                await mark_error_by_channel(
                    company_id,
                    channel_account_id,
                    "Telegram session expired, reconnect required",
                    "RECONNECT_REQUIRED",
                )
                raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

            me = await client.get_me()

            async for dialog in client.iter_dialogs(limit=dialogs_cap):
                entity = dialog.entity
                if not isinstance(entity, (User, Channel)):
                    continue

                if isinstance(entity, Channel) and not getattr(entity, "megagroup", False):
                    continue

                result.dialogs_synced += 1
                conversation_type = _resolve_conversation_type(entity)

                async for message in client.iter_messages(dialog.id, limit=messages_cap):
                    sender_id = message.sender_id
                    is_outgoing = bool(getattr(message, "out", False))

                    sender_external_id = str(sender_id if sender_id is not None else me.id)
                    sender_type = "self" if is_outgoing else "user"
                    sender_full_name = None
                    sender_username = None

                    if sender_id is not None and str(sender_id) == str(me.id):
                        sender_full_name = " ".join(part for part in [me.first_name, me.last_name] if part).strip() or None
                        sender_username = me.username
                    elif isinstance(entity, User):
                        sender_full_name = " ".join(part for part in [entity.first_name, entity.last_name] if part).strip() or None
                        sender_username = entity.username

                    text = message.message if getattr(message, "message", None) else None

                    payload: dict[str, Any] = {
                        "telegramAccountId": str(account["telegramAccountId"]),
                        "externalConversationId": str(dialog.id),
                        "externalMessageId": str(message.id),
                        "senderExternalId": sender_external_id,
                        "senderType": sender_type,
                        "text": text,
                        "sentAt": message.date.isoformat(),
                        "isOutgoing": is_outgoing,
                        "replyToExternalMessageId": str(message.reply_to.reply_to_msg_id) if message.reply_to else None,
                        "rawPayload": {
                            "id": message.id,
                            "out": is_outgoing,
                            "senderId": sender_id,
                            "dialogType": conversation_type,
                            "hasMedia": bool(getattr(message, "media", None)),
                        },
                        "conversationTitle": dialog.title,
                        "hasAttachment": bool(getattr(message, "media", None)),
                    }
                    if sender_full_name:
                        payload["senderFullName"] = sender_full_name
                    if sender_username:
                        payload["senderUsername"] = sender_username

                    await push_message_event(payload)
                    result.messages_synced += 1

            await _set_sync_markers(conn, account["telegramAccountId"], account["channelAccountId"])
            return result
        finally:
            await client.disconnect()


def _parse_peer_id(raw: str) -> int | str:
    """Normalize external_conversation_id for Telethon: strip and convert numeric to int."""
    s = (raw or "").strip()
    if not s:
        raise WorkerError("INVALID_CONVERSATION_ID", "External conversation id is empty", 400)
    if s.lstrip("-").isdigit():
        return int(s)
    return s


async def send_message(
    company_id: str,
    channel_account_id: str,
    external_conversation_id: str,
    text: str,
    crypto: SessionCrypto,
) -> dict[str, Any]:
    peer = _parse_peer_id(external_conversation_id)

    async with get_connection() as conn:
        account = await _load_connected_account(conn, company_id, channel_account_id)
        session = crypto.decrypt(account["sessionDataEncrypted"])

        client = create_client(session)

        try:
            await client.connect()

            if not await client.is_user_authorized():
                await mark_error_by_channel(
                    company_id,
                    channel_account_id,
                    "Telegram session expired, reconnect required",
                    "RECONNECT_REQUIRED",
                )
                raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400)

            me = await client.get_me()
            # Resolve to InputPeer; for bare IDs Telethon only looks in cache, so we may need to fill cache via get_dialogs first
            try:
                input_entity = await client.get_input_entity(peer)
            except (ValueError, TypeError):
                # Entity not in cache (e.g. after session restart). Load dialogs so the peer gets cached.
                try:
                    await client.get_dialogs(limit=100)
                    input_entity = await client.get_input_entity(peer)
                except (ValueError, TypeError) as e:
                    raise WorkerError(
                        "INVALID_CONVERSATION_ID",
                        f"Could not resolve conversation: {e!s}",
                        400,
                    ) from e
            sent = await client.send_message(entity=input_entity, message=text)

            await push_message_event(
                {
                    "telegramAccountId": str(account["telegramAccountId"]),
                    "externalConversationId": external_conversation_id,
                    "externalMessageId": str(sent.id),
                    "senderExternalId": str(me.id),
                    "senderType": "self",
                    "senderFullName": " ".join(part for part in [me.first_name, me.last_name] if part).strip() or None,
                    "senderUsername": me.username,
                    "text": sent.message,
                    "sentAt": sent.date.isoformat(),
                    "isOutgoing": True,
                    "replyToExternalMessageId": None,
                    "rawPayload": {
                        "id": sent.id,
                        "out": True,
                        "senderId": me.id,
                        "hasMedia": bool(getattr(sent, "media", None)),
                    },
                    "hasAttachment": bool(getattr(sent, "media", None)),
                }
            )

            now = _now()
            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET "lastEventAt" = %s, "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (now, now, account["telegramAccountId"]),
                )

            return {
                "status": "sent",
                "details": {
                    "externalMessageId": str(sent.id)
                }
            }
        except ValueError as exc:
            raise WorkerError("INVALID_CONVERSATION_ID", "Invalid external conversation id", 400) from exc
        finally:
            await client.disconnect()
