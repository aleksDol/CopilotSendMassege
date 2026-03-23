import asyncio
import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

from telethon.errors import FloodWaitError, RPCError, ServerError, TimedOutError

from app.config import settings
from app.db import get_connection
from app.services.auth_flow import WorkerError, mark_error_by_channel

logger = logging.getLogger("telegram-worker.safety")


def _now() -> datetime:
    return datetime.now(timezone.utc)


@dataclass
class AccountSafetyState:
    send_lock: asyncio.Lock = field(default_factory=asyncio.Lock)
    sync_semaphore: asyncio.Semaphore = field(
        default_factory=lambda: asyncio.Semaphore(max(1, settings.telegram_max_concurrent_syncs_per_account))
    )
    active_syncs: int = 0
    send_timestamps: deque[datetime] = field(default_factory=deque)
    new_conversation_timestamps: deque[datetime] = field(default_factory=deque)
    recent_error_timestamps: deque[datetime] = field(default_factory=deque)
    safety_mode_until: datetime | None = None
    last_send_at: datetime | None = None
    last_sync_at: datetime | None = None


class TelegramErrorClassifier:
    @staticmethod
    def classify(exc: Exception) -> str:
        if isinstance(exc, FloodWaitError):
            return "throttling"
        if isinstance(exc, (ServerError, TimedOutError)):
            return "transient"
        if isinstance(exc, RPCError):
            text = str(exc).upper()
            if "AUTH" in text or "SESSION" in text:
                return "session"
            if "FLOOD" in text or "RATE" in text or "SLOWMODE" in text:
                return "throttling"
            if "TIMEOUT" in text:
                return "transient"
            return "permanent"
        if isinstance(exc, WorkerError):
            if exc.code in {"RECONNECT_REQUIRED", "SESSION_MISSING"}:
                return "session"
            if "RATE" in exc.code or "SAFETY_MODE" in exc.code or "COOLDOWN" in exc.code:
                return "throttling"
        return "permanent"


async def _has_outbound_history(channel_account_id: str, external_conversation_id: str) -> bool:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                """
                SELECT 1
                FROM "Message" m
                JOIN "Conversation" c ON c."id" = m."conversationId"
                WHERE c."channelAccountId" = %s
                  AND c."externalConversationId" = %s
                  AND m."direction" = 'OUTBOUND'
                LIMIT 1
                """,
                (channel_account_id, external_conversation_id),
            )
            return bool(await cur.fetchone())


class TelegramSafetyService:
    def __init__(self) -> None:
        self._states: dict[str, AccountSafetyState] = {}
        self._states_lock = asyncio.Lock()

    async def _state(self, channel_account_id: str) -> AccountSafetyState:
        async with self._states_lock:
            state = self._states.get(channel_account_id)
            if state is None:
                state = AccountSafetyState()
                self._states[channel_account_id] = state
            return state

    @staticmethod
    def _trim_window(queue: deque[datetime], since: datetime) -> None:
        while queue and queue[0] < since:
            queue.popleft()

    async def check_sync_allowed(self, *, company_id: str, channel_account_id: str) -> None:
        _ = company_id
        state = await self._state(channel_account_id)
        now = _now()
        min_interval = max(1, settings.telegram_sync_min_interval_seconds)
        if state.last_sync_at and (now - state.last_sync_at).total_seconds() < min_interval:
            wait = int(min_interval - (now - state.last_sync_at).total_seconds())
            raise WorkerError(
                "SYNC_COOLDOWN_ACTIVE",
                f"Sync is cooling down. Try again in {max(1, wait)} seconds.",
                429,
            )
        if state.active_syncs >= max(1, settings.telegram_max_concurrent_syncs_per_account):
            raise WorkerError("SYNC_ALREADY_RUNNING", "Sync already running for this Telegram account", 409)

    async def mark_sync_started(self, channel_account_id: str) -> None:
        state = await self._state(channel_account_id)
        state.last_sync_at = _now()

    async def execute_sync(
        self,
        *,
        company_id: str,
        channel_account_id: str,
        sync_coro_factory: Callable[[], Awaitable[dict[str, Any]]],
    ) -> dict[str, Any]:
        await self.check_sync_allowed(company_id=company_id, channel_account_id=channel_account_id)
        state = await self._state(channel_account_id)
        async with state.sync_semaphore:
            state.active_syncs += 1
            try:
                await self.mark_sync_started(channel_account_id)
                return await sync_coro_factory()
            finally:
                state.active_syncs = max(0, state.active_syncs - 1)

    async def execute_send(
        self,
        *,
        company_id: str,
        channel_account_id: str,
        external_conversation_id: str,
        send_coro_factory: Callable[[], Awaitable[dict[str, Any]]],
    ) -> dict[str, Any]:
        state = await self._state(channel_account_id)
        queue_started = _now()
        was_queued = state.send_lock.locked()
        async with state.send_lock:
            queue_wait_ms = int((_now() - queue_started).total_seconds() * 1000)
            now = _now()

            if state.safety_mode_until and state.safety_mode_until > now:
                raise WorkerError(
                    "SAFETY_MODE_ACTIVE",
                    "Safety mode is temporarily enabled for this account. Please try again later.",
                    429,
                )

            self._trim_window(state.send_timestamps, now - timedelta(minutes=5))
            self._trim_window(state.new_conversation_timestamps, now - timedelta(hours=1))
            self._trim_window(state.recent_error_timestamps, now - timedelta(hours=1))

            per_minute = sum(1 for ts in state.send_timestamps if ts >= now - timedelta(minutes=1))
            per_five_minutes = len(state.send_timestamps)
            if per_minute >= max(1, settings.telegram_max_sends_per_minute):
                raise WorkerError("SEND_RATE_LIMIT_PER_MINUTE", "Send rate limit reached. Try again shortly.", 429)
            if per_five_minutes >= max(1, settings.telegram_max_sends_per_5_minutes):
                raise WorkerError("SEND_RATE_LIMIT_PER_5_MINUTES", "Send limit reached for recent window. Try later.", 429)

            # Conservative cap only for outbound-first/new dialogue behavior.
            has_outbound_history = await _has_outbound_history(channel_account_id, external_conversation_id)
            if not has_outbound_history:
                state.new_conversation_timestamps.append(now)
            if len(state.new_conversation_timestamps) > max(1, settings.telegram_max_new_conversations_per_hour):
                raise WorkerError(
                    "NEW_CONVERSATION_RATE_LIMIT",
                    "Too many new outgoing conversations in a short period. Please slow down.",
                    429,
                )

            if state.last_send_at:
                min_interval_ms = max(250, settings.telegram_min_send_interval_ms)
                elapsed_ms = int((now - state.last_send_at).total_seconds() * 1000)
                if elapsed_ms < min_interval_ms:
                    wait_ms = min_interval_ms - elapsed_ms
                    logger.info(
                        "send cooldown applied channelAccount=%s waitMs=%s",
                        channel_account_id,
                        wait_ms,
                    )
                    await asyncio.sleep(wait_ms / 1000)

            attempt = 0
            max_attempts = max(1, settings.telegram_send_retry_max_attempts)
            while True:
                attempt += 1
                try:
                    response = await send_coro_factory()
                    state.last_send_at = _now()
                    state.send_timestamps.append(state.last_send_at)
                    state.recent_error_timestamps.clear()
                    logger.info(
                        "send job executed company=%s channelAccount=%s queued=%s queueWaitMs=%s attempt=%s",
                        company_id,
                        channel_account_id,
                        int(was_queued),
                        queue_wait_ms,
                        attempt,
                    )
                    response.setdefault("status", "sent")
                    response["queue"] = {
                        "queued": was_queued or queue_wait_ms > 0,
                        "queueWaitMs": queue_wait_ms,
                        "attempts": attempt,
                    }
                    return response
                except Exception as exc:
                    category = TelegramErrorClassifier.classify(exc)
                    logger.warning(
                        "telegram send error company=%s channelAccount=%s conversation=%s category=%s attempt=%s err=%s",
                        company_id,
                        channel_account_id,
                        external_conversation_id,
                        category,
                        attempt,
                        exc,
                    )

                    if isinstance(exc, WorkerError):
                        state.recent_error_timestamps.append(_now())
                        await self._maybe_enable_safety_mode(company_id, channel_account_id, state)
                        raise

                    if category in {"transient", "throttling"} and attempt < max_attempts:
                        await asyncio.sleep(min(5.0, 0.8 * attempt))
                        continue

                    state.recent_error_timestamps.append(_now())
                    await self._maybe_enable_safety_mode(company_id, channel_account_id, state)

                    if category == "session":
                        await mark_error_by_channel(
                            company_id,
                            channel_account_id,
                            "Telegram session needs reconnect",
                            "RECONNECT_REQUIRED",
                        )
                        raise WorkerError("RECONNECT_REQUIRED", "Telegram session expired, reconnect required", 400) from exc
                    if category == "throttling":
                        raise WorkerError("TELEGRAM_THROTTLED", "Telegram temporary send restriction. Try later.", 429) from exc
                    if category == "transient":
                        raise WorkerError("TELEGRAM_TRANSIENT_ERROR", "Temporary Telegram send issue. Retry shortly.", 503) from exc
                    raise WorkerError("TELEGRAM_SEND_FAILED", f"Telegram send failed: {exc!s}", 500) from exc

    async def _maybe_enable_safety_mode(
        self,
        company_id: str,
        channel_account_id: str,
        state: AccountSafetyState,
    ) -> None:
        threshold = max(1, settings.telegram_safety_mode_error_threshold)
        if len(state.recent_error_timestamps) < threshold:
            return
        until = _now() + timedelta(minutes=max(1, settings.telegram_safety_mode_cooldown_minutes))
        state.safety_mode_until = until
        await mark_error_by_channel(
            company_id,
            channel_account_id,
            "Safety mode enabled due to repeated send errors. Please try later.",
            "ERROR",
        )
        logger.warning(
            "safety mode enabled company=%s channelAccount=%s until=%s errorsWindow=%s",
            company_id,
            channel_account_id,
            until.isoformat(),
            len(state.recent_error_timestamps),
        )


safety_service = TelegramSafetyService()
