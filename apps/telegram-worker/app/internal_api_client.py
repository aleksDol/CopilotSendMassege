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
