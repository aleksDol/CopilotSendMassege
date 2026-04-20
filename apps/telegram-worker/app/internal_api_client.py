import asyncio
import logging
from typing import Any

import httpx

from app.config import settings
from app.services.auth_flow import WorkerError

_logger = logging.getLogger("telegram-worker.internal-api")


async def push_message_event(event: dict[str, Any], *, timeout_s: float = 8.0) -> None:
    """
    Deliver message event to API.

    Important: keep timeout short by default to avoid accumulating load.
    Reliability-critical paths (live listener / sync) should pass a larger timeout explicitly.
    """
    url = f"{settings.api_internal_url}/internal/telegram/events/message"

    async with httpx.AsyncClient(timeout=timeout_s) as client:
        response = await client.post(
            url,
            headers={"x-internal-token": settings.internal_api_token},
            json=event,
        )

    if response.status_code >= 400:
        detail = response.text
        raise WorkerError("INGESTION_FAILED", f"Failed to ingest message event: {detail}", 502)


async def push_message_event_with_retry(
    event: dict[str, Any],
    *,
    timeout_s: float = 20.0,
    attempts: int = 4,
    base_delay_s: float = 0.4,
) -> bool:
    """
    Same as push_message_event but retries on transient failures (network / 5xx).
    Returns True if delivered, False after exhausting attempts (logs warning).
    """
    delay = base_delay_s
    last_exc: Exception | None = None
    for i in range(attempts):
        try:
            await push_message_event(event, timeout_s=timeout_s)
            return True
        except Exception as exc:
            last_exc = exc
            if i == attempts - 1:
                break
            await asyncio.sleep(delay)
            delay = min(5.0, delay * 2.0)
    _logger.warning(
        "push_message_event_with_retry failed telegramAccountId=%s externalConversationId=%s externalMessageId=%s err=%s",
        event.get("telegramAccountId"),
        event.get("externalConversationId"),
        event.get("externalMessageId"),
        last_exc,
    )
    return False


async def list_channel_comment_sources(*, telegram_account_id: str) -> list[dict[str, Any]]:
    """
    Fetch active LeadRadar sources of type `channel_comments` for this telegram account.
    Used by telegram-worker to ingest channel comments without introducing a new pipeline.
    """
    url = f"{settings.api_internal_url}/internal/leadradar/sources/channel-comments"

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            url,
            headers={"x-internal-token": settings.internal_api_token},
            params={"telegramAccountId": telegram_account_id},
        )

    if response.status_code >= 400:
        detail = response.text
        raise WorkerError("LEADRADAR_SOURCES_FETCH_FAILED", f"Failed to fetch channel comment sources: {detail}", 502)

    data = response.json() if response.content else {}
    items = data.get("items") if isinstance(data, dict) else None
    return items if isinstance(items, list) else []


async def list_leadradar_sync_priority_sources(*, telegram_account_id: str) -> list[dict[str, Any]]:
    """
    Chats the user monitors in LeadRadar (except channel_comments — those use a dedicated path).
    Used to sync messages even when the chat is outside iter_dialogs(limit=N).
    """
    url = f"{settings.api_internal_url}/internal/leadradar/sources/sync-priority"

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            url,
            headers={"x-internal-token": settings.internal_api_token},
            params={"telegramAccountId": telegram_account_id},
        )

    if response.status_code >= 400:
        detail = response.text
        raise WorkerError("LEADRADAR_SOURCES_FETCH_FAILED", f"Failed to fetch sync-priority sources: {detail}", 502)

    data = response.json() if response.content else {}
    items = data.get("items") if isinstance(data, dict) else None
    return items if isinstance(items, list) else []
