from typing import Optional

from telethon import TelegramClient
from telethon.sessions import StringSession

from app.config import settings


def create_client(session_string: Optional[str]) -> TelegramClient:
    return TelegramClient(
        StringSession(session_string or ""),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )
