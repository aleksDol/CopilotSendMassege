import asyncio
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import psycopg
from telethon import events
from telethon.tl.types import Channel, User

from app.config import settings
from app.crypto import SessionCrypto
from app.db import get_connection
from app.internal_api_client import push_message_event
from app.telegram_client import create_client

logger = logging.getLogger("telegram-worker.live-listener")


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _resolve_conversation_type(entity: Any) -> str:
    if isinstance(entity, Channel):
        return "group" if getattr(entity, "megagroup", False) else "channel"
    return "direct"


@dataclass(frozen=True)
class ConnectedAccount:
    telegram_account_id: str
    company_id: str
    channel_account_id: str
    session_data_encrypted: str


async def _list_connected_accounts_for_listener() -> list[ConnectedAccount]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT
                  ca."companyId",
                  ta."id" AS "telegramAccountId",
                  ta."channelAccountId",
                  ta."sessionDataEncrypted"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."channelType" = 'TELEGRAM'
                  AND ta."loginStatus" IN ('CONNECTED', 'ERROR', 'RECONNECT_REQUIRED')
                  AND ta."sessionDataEncrypted" IS NOT NULL
                """
            )
            rows = await cur.fetchall()

    accounts: list[ConnectedAccount] = []
    for row in rows or []:
        try:
            accounts.append(
                ConnectedAccount(
                    telegram_account_id=str(row["telegramAccountId"]),
                    company_id=str(row["companyId"]),
                    channel_account_id=str(row["channelAccountId"]),
                    session_data_encrypted=str(row["sessionDataEncrypted"]),
                )
            )
        except Exception:
            continue
    return accounts


async def _mark_last_event(telegram_account_id: str) -> None:
    try:
        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    """
                    UPDATE "TelegramAccount"
                    SET "lastEventAt" = %s, "updatedAt" = %s, "errorMessage" = NULL
                    WHERE "id" = %s
                    """,
                    (_now(), _now(), telegram_account_id),
                )
    except Exception:
        # best effort
        return


async def _push_with_retry(
    telegram_account_id: str,
    payload: dict[str, Any],
    *,
    attempts: int = 4,
    base_delay_s: float = 0.4,
) -> None:
    """
    Deliver message event to API reliably.
    We retry on transient failures (network / 5xx) and log final failure loudly.
    """
    delay = base_delay_s
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            await push_message_event(payload)
            return
        except Exception as exc:
            last_exc = exc
            is_last = i == attempts - 1
            if is_last:
                logger.warning(
                    "listener ingestion push failed telegramAccountId=%s externalConversationId=%s externalMessageId=%s err=%s",
                    telegram_account_id,
                    payload.get("externalConversationId"),
                    payload.get("externalMessageId"),
                    exc,
                )
                return
            await asyncio.sleep(delay)
            delay = min(5.0, delay * 2.0)
    if last_exc:
        logger.warning("listener ingestion push failed telegramAccountId=%s err=%s", telegram_account_id, last_exc)


async def _run_account_listener(account: ConnectedAccount, crypto: SessionCrypto, stop: asyncio.Event) -> None:
    session = crypto.decrypt(account.session_data_encrypted)
    reconnect_backoff = 1.0

    while not stop.is_set():
        client = create_client(session)
        try:
            await client.connect()
            if not await client.is_user_authorized():
                logger.warning("listener unauthorized telegramAccountId=%s", account.telegram_account_id)
                return

            me = await client.get_me()

            async def on_new_message(event: events.NewMessage.Event) -> None:
                try:
                    msg = event.message
                    if msg is None:
                        return

                    chat = await event.get_chat()
                    if chat is None:
                        return

                    # Keep parity with sync: ignore broadcast channels (non-megagroup)
                    if isinstance(chat, Channel) and not getattr(chat, "megagroup", False):
                        return

                    conversation_type = _resolve_conversation_type(chat)
                    is_outgoing = bool(getattr(msg, "out", False))

                    sender = await event.get_sender()
                    sender_id = getattr(msg, "sender_id", None)

                    sender_external_id = str(sender_id if sender_id is not None else me.id)
                    sender_type = "self" if is_outgoing else "user"

                    sender_full_name = None
                    sender_username = None
                    if isinstance(sender, User):
                        sender_full_name = (
                            " ".join(part for part in [sender.first_name, sender.last_name] if part).strip() or None
                        )
                        sender_username = sender.username

                    text = msg.message if getattr(msg, "message", None) else None
                    has_attachment = bool(getattr(msg, "media", None))

                    conversation_title = None
                    if isinstance(chat, User):
                        conversation_title = (
                            " ".join(part for part in [chat.first_name, chat.last_name] if part).strip()
                            or (chat.username or str(chat.id))
                        )
                    else:
                        conversation_title = getattr(chat, "title", None)

                    external_conversation_id = str(event.chat_id) if getattr(event, "chat_id", None) is not None else None
                    if not external_conversation_id or external_conversation_id == "None":
                        return

                    payload = {
                        "telegramAccountId": account.telegram_account_id,
                        "externalConversationId": external_conversation_id,
                        "externalMessageId": str(msg.id),
                        "senderExternalId": sender_external_id,
                        "senderType": sender_type,
                        "senderFullName": sender_full_name,
                        "senderUsername": sender_username,
                        "text": text,
                        "sentAt": msg.date.isoformat() if getattr(msg, "date", None) else _now().isoformat(),
                        "isOutgoing": is_outgoing,
                        "replyToExternalMessageId": str(msg.reply_to.reply_to_msg_id)
                        if getattr(msg, "reply_to", None)
                        else None,
                        "rawPayload": {
                            "id": msg.id,
                            "out": is_outgoing,
                            "senderId": sender_id,
                            "dialogType": conversation_type,
                            "hasMedia": has_attachment,
                        },
                        "conversationTitle": conversation_title,
                        "hasAttachment": has_attachment,
                    }

                    if settings.telegram_live_listener_log_events:
                        logger.info(
                            "listener event telegramAccountId=%s externalConversationId=%s externalMessageId=%s senderExternalId=%s",
                            account.telegram_account_id,
                            external_conversation_id,
                            payload.get("externalMessageId"),
                            sender_external_id,
                        )

                    await _push_with_retry(account.telegram_account_id, payload)
                    await _mark_last_event(account.telegram_account_id)
                except Exception as exc:
                    logger.warning("listener handler error telegramAccountId=%s err=%s", account.telegram_account_id, exc)

            # Incoming-only reduces noise and avoids looping on our own outbound messages.
            client.add_event_handler(on_new_message, events.NewMessage(incoming=True))

            logger.info(
                "listener connected company=%s channelAccount=%s telegramAccountId=%s",
                account.company_id,
                account.channel_account_id,
                account.telegram_account_id,
            )

            reconnect_backoff = 1.0

            # Wait until either stop is requested or Telegram connection drops.
            stop_task = asyncio.create_task(stop.wait())
            # telethon's `client.disconnected` is a Future (not a coroutine). `create_task` would crash.
            disconnected_fut = asyncio.ensure_future(client.disconnected)

            done, pending = await asyncio.wait(
                {stop_task, disconnected_fut},
                return_when=asyncio.FIRST_COMPLETED,
            )
            for t in done:
                if not t.cancelled():
                    _ = t.result()
            for t in pending:
                t.cancel()

        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.warning("listener error telegramAccountId=%s: %s", account.telegram_account_id, exc)
        finally:
            try:
                await client.disconnect()
            except Exception:
                pass

        if stop.is_set():
            break

        # Backoff reconnect to avoid tight loops on network flaps.
        await asyncio.sleep(min(15.0, reconnect_backoff))
        reconnect_backoff = min(15.0, reconnect_backoff * 2.0)

    logger.info("listener stopped telegramAccountId=%s", account.telegram_account_id)


class LiveListenerManager:
    def __init__(self, crypto: SessionCrypto):
        self._crypto = crypto
        self._stop = asyncio.Event()
        self._tasks: dict[str, asyncio.Task] = {}
        self.last_refresh_at: datetime | None = None
        self.last_desired_count: int = 0
        self.last_task_error_count: int = 0
        self._last_task_error: str | None = None

    def _attach_task_observers(self, telegram_account_id: str, task: asyncio.Task) -> None:
        def _done(t: asyncio.Task) -> None:
            if t.cancelled():
                return
            exc = t.exception()
            if exc:
                self.last_task_error_count += 1
                self._last_task_error = f"{telegram_account_id}: {exc!s}"
                logger.warning("listener task crashed telegramAccountId=%s err=%s", telegram_account_id, exc)

        task.add_done_callback(_done)

    async def run(self) -> None:
        refresh = max(5, int(settings.telegram_live_listener_refresh_seconds))
        logger.info("live-listener manager started refresh=%ss", refresh)

        while not self._stop.is_set():
            try:
                accounts = await _list_connected_accounts_for_listener()
                desired = {a.telegram_account_id: a for a in accounts}
                self.last_refresh_at = _now()
                self.last_desired_count = len(desired)

                # stop removed
                for tid, task in list(self._tasks.items()):
                    if tid not in desired:
                        task.cancel()
                        self._tasks.pop(tid, None)

                # start new
                for tid, acct in desired.items():
                    if tid in self._tasks and not self._tasks[tid].done():
                        continue
                    task = asyncio.create_task(_run_account_listener(acct, self._crypto, self._stop))
                    self._attach_task_observers(tid, task)
                    self._tasks[tid] = task

            except Exception as exc:
                logger.warning("live-listener refresh failed: %s", exc)

            try:
                await asyncio.wait_for(self._stop.wait(), timeout=refresh)
            except asyncio.TimeoutError:
                continue

        logger.info("live-listener manager stopping")

    async def stop(self) -> None:
        self._stop.set()
        for task in list(self._tasks.values()):
            task.cancel()
        if self._tasks:
            await asyncio.gather(*self._tasks.values(), return_exceptions=True)
        self._tasks.clear()

    def active_listener_count(self) -> int:
        return sum(1 for t in self._tasks.values() if t and not t.done())

    def last_task_error(self) -> str | None:
        return self._last_task_error

