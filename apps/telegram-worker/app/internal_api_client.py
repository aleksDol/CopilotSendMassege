from typing import Any

import httpx

from app.config import settings
from app.services.auth_flow import WorkerError


async def push_message_event(event: dict[str, Any]) -> None:
    url = f"{settings.api_internal_url}/internal/telegram/events/message"

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(
            url,
            headers={"x-internal-token": settings.internal_api_token},
            json=event,
        )

    if response.status_code >= 400:
        detail = response.text
        raise WorkerError("INGESTION_FAILED", f"Failed to ingest message event: {detail}", 502)


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
