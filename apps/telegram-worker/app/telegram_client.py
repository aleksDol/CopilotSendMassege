import logging
from typing import Any, Optional

from python_socks import ProxyType
from telethon import TelegramClient
from telethon.sessions import StringSession

from app.config import settings

logger = logging.getLogger("telegram-worker.telegram")


def telegram_proxy_log_context() -> str:
    """Short, safe suffix for error logs (no passwords)."""
    if not settings.tg_proxy_enabled:
        return "telethon=direct"
    host = (settings.tg_proxy_host or "").strip()
    port = settings.tg_proxy_port
    if not host or port is None:
        return "telethon=direct (proxy enabled but host/port missing)"
    auth = "yes" if (settings.tg_proxy_username or "").strip() else "no"
    return (
        f"telethon=proxy type={settings.tg_proxy_type} host={host} port={port} "
        f"rdns={settings.tg_proxy_rdns} auth={auth}"
    )


def log_telegram_proxy_on_startup() -> None:
    """Log proxy mode once at process startup (no secrets)."""
    if not settings.tg_proxy_enabled:
        logger.info("Telegram proxy: disabled; Telethon will use a direct connection")
        return
    host = (settings.tg_proxy_host or "").strip()
    port = settings.tg_proxy_port
    if not host or port is None:
        logger.warning(
            "Telegram proxy: TG_PROXY_ENABLED is true but TG_PROXY_HOST or TG_PROXY_PORT is missing; "
            "using direct connection"
        )
        return
    ptype = (settings.tg_proxy_type or "").strip().lower()
    if ptype != "socks5":
        logger.warning(
            "Telegram proxy: type=%r is not supported (only socks5); using direct connection",
            settings.tg_proxy_type,
        )
        return
    auth = "yes" if (settings.tg_proxy_username or "").strip() else "no"
    logger.info(
        "Telegram proxy: enabled type=socks5 host=%s port=%s rdns=%s auth=%s",
        host,
        port,
        settings.tg_proxy_rdns,
        auth,
    )


def _build_telegram_proxy_tuple() -> Optional[tuple[Any, ...]]:
    """
    Tuple format matches Telethon / PySocks: (proxy_type, addr, port[, rdns[, username, password]]).
    See telethon.network.connection.Connection._parse_proxy.
    """
    if not settings.tg_proxy_enabled:
        return None
    host = (settings.tg_proxy_host or "").strip()
    port = settings.tg_proxy_port
    if not host or port is None:
        logger.warning(
            "TG_PROXY_ENABLED is true but TG_PROXY_HOST or TG_PROXY_PORT is missing; Telethon connects without proxy"
        )
        return None
    if port < 1 or port > 65535:
        logger.warning("TG_PROXY_PORT=%s is invalid; Telethon connects without proxy", port)
        return None
    ptype = (settings.tg_proxy_type or "").strip().lower()
    if ptype != "socks5":
        logger.warning(
            "TG_PROXY_TYPE=%r is not supported (only socks5); Telethon connects without proxy",
            settings.tg_proxy_type,
        )
        return None
    rdns = bool(settings.tg_proxy_rdns)
    user = (settings.tg_proxy_username or "").strip()
    password = settings.tg_proxy_password or ""
    if user:
        return (ProxyType.SOCKS5, host, port, rdns, user, password)
    return (ProxyType.SOCKS5, host, port, rdns)


def create_client(session_string: Optional[str]) -> TelegramClient:
    proxy = _build_telegram_proxy_tuple()
    if proxy is not None:
        if len(proxy) == 6:
            _, h, p, rdns, _, _ = proxy
            logger.info(
                "TelegramClient starting with proxy host=%s port=%s rdns=%s auth=yes",
                h,
                p,
                rdns,
            )
        else:
            _, h, p, rdns = proxy
            logger.info(
                "TelegramClient starting with proxy host=%s port=%s rdns=%s auth=no",
                h,
                p,
                rdns,
            )
        return TelegramClient(
            StringSession(session_string or ""),
            settings.telegram_api_id,
            settings.telegram_api_hash,
            proxy=proxy,
        )

    logger.debug("TelegramClient starting without proxy (direct connection)")
    return TelegramClient(
        StringSession(session_string or ""),
        settings.telegram_api_id,
        settings.telegram_api_hash,
    )
