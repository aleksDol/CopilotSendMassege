import asyncio
import logging
import time
from datetime import datetime, timezone

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from app.auth import verify_internal_token
from app.config import settings
from app.crypto import SessionCrypto
from app.schemas import (
    LogoutRequest,
    ResolveChatByLinkRequest,
    PollLoginQrRequest,
    SendMessageRequest,
    StartLoginQrRequest,
    StartLoginRequest,
    SyncRequest,
    VerifyCodeRequest,
    VerifyPasswordQrRequest,
    VerifyPasswordRequest,
)
from app.services.auth_flow import (
    WorkerError,
    logout_and_clear_session,
    mark_error,
    mark_error_by_channel,
    poll_qr_login,
    start_login,
    start_qr_login,
    verify_code,
    verify_password,
    verify_password_qr,
)
from app.services.sync_service import list_connected_accounts, run_initial_sync, send_message, resolve_public_group_by_link
from app.services.live_listener import LiveListenerManager
from app.services.safety import safety_service

logger = logging.getLogger("telegram-worker")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

started_at = time.time()
concurrency_limiter = asyncio.Semaphore(settings.telegram_worker_concurrency)

app = FastAPI(title="telegram-worker", version="0.1.0")
crypto = SessionCrypto(settings.telegram_session_encryption_key)
auto_sync_task: asyncio.Task | None = None
live_listener_task: asyncio.Task | None = None
live_listener_manager: LiveListenerManager | None = None


@app.exception_handler(WorkerError)
async def worker_error_handler(_request, exc: WorkerError):
    logger.error("WorkerError: %s - %s", exc.code, exc.message)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": {"code": exc.code, "message": exc.message}},
    )


@app.get("/health")
async def health() -> dict[str, bool]:
    return {"ok": True}


@app.get("/metrics")
async def metrics() -> dict[str, float | int]:
    active_listeners = live_listener_manager.active_listener_count() if live_listener_manager else 0
    last_refresh_age_s = 0
    if live_listener_manager and live_listener_manager.last_refresh_at:
        last_refresh_age_s = max(
            0, int((datetime.now(timezone.utc) - live_listener_manager.last_refresh_at).total_seconds())
        )
    return {
        "uptimeSeconds": round(time.time() - started_at, 2),
        "configuredConcurrency": settings.telegram_worker_concurrency,
        "autoSyncEnabled": int(settings.telegram_auto_sync_enabled),
        "liveListenerEnabled": int(settings.telegram_live_listener_enabled),
        "liveListenerActiveCount": active_listeners,
        "liveListenerLastRefreshAgeSeconds": last_refresh_age_s,
        "liveListenerDesiredAccountCount": live_listener_manager.last_desired_count if live_listener_manager else 0,
        "liveListenerTaskErrorCount": live_listener_manager.last_task_error_count if live_listener_manager else 0,
    }


async def _auto_sync_loop() -> None:
    interval = max(5, settings.telegram_auto_sync_interval_seconds)
    dialogs_limit = max(1, settings.telegram_auto_sync_dialog_limit)
    messages_limit = max(1, settings.telegram_auto_sync_messages_per_dialog)

    logger.info(
        "telegram auto-sync enabled: interval=%ss dialogsLimit=%s messagesPerDialog=%s",
        interval,
        dialogs_limit,
        messages_limit,
    )

    while True:
        try:
            accounts = await list_connected_accounts()
            for account in accounts:
                try:
                    async with concurrency_limiter:
                        await run_initial_sync(
                            company_id=account["companyId"],
                            channel_account_id=account["channelAccountId"],
                            dialogs_limit=dialogs_limit,
                            messages_per_dialog=messages_limit,
                            crypto=crypto,
                        )
                except WorkerError as exc:
                    logger.warning(
                        "auto-sync worker error for company=%s channelAccount=%s code=%s message=%s",
                        account["companyId"],
                        account["channelAccountId"],
                        exc.code,
                        exc.message,
                    )
                except Exception as exc:  # pragma: no cover - defensive log
                    logger.exception(
                        "auto-sync failed for company=%s channelAccount=%s: %s",
                        account["companyId"],
                        account["channelAccountId"],
                        exc,
                    )
        except Exception as exc:  # pragma: no cover - defensive log
            logger.exception("auto-sync iteration failed: %s", exc)

        await asyncio.sleep(interval)


@app.on_event("startup")
async def _startup_auto_sync() -> None:
    global auto_sync_task, live_listener_task, live_listener_manager
    if not settings.telegram_auto_sync_enabled:
        logger.info("telegram auto-sync disabled")
    else:
        auto_sync_task = asyncio.create_task(_auto_sync_loop())

    if settings.telegram_live_listener_enabled:
        live_listener_manager = LiveListenerManager(crypto)
        live_listener_task = asyncio.create_task(live_listener_manager.run())
        logger.info("telegram live listener enabled")
    else:
        logger.info("telegram live listener disabled")


@app.on_event("shutdown")
async def _shutdown_auto_sync() -> None:
    global auto_sync_task, live_listener_task, live_listener_manager
    if auto_sync_task:
        auto_sync_task.cancel()
        try:
            await auto_sync_task
        except asyncio.CancelledError:
            pass
        auto_sync_task = None

    if live_listener_manager:
        try:
            await live_listener_manager.stop()
        except Exception:
            pass
        live_listener_manager = None

    if live_listener_task:
        live_listener_task.cancel()
        try:
            await live_listener_task
        except asyncio.CancelledError:
            pass
        live_listener_task = None


@app.post("/internal/telegram/start-login", dependencies=[Depends(verify_internal_token)])
async def internal_start_login(payload: StartLoginRequest) -> dict:
    logger.info("start-login requested for company=%s phone=%s", payload.company_id, payload.phone)
    async with concurrency_limiter:
        try:
            return await start_login(payload.company_id, payload.channel_account_id, payload.phone, crypto)
        except WorkerError:
            raise
        except Exception as exc:
            await mark_error(payload.company_id, payload.phone, str(exc), "ERROR")
            raise WorkerError("TELEGRAM_START_FAILED", "Failed to start Telegram login", 500) from exc


@app.post("/internal/telegram/verify-code", dependencies=[Depends(verify_internal_token)])
async def internal_verify_code(payload: VerifyCodeRequest) -> dict:
    logger.info("verify-code requested for company=%s phone=%s", payload.company_id, payload.phone)
    async with concurrency_limiter:
        try:
            return await verify_code(payload.company_id, payload.phone, payload.code, crypto)
        except WorkerError:
            raise
        except Exception as exc:
            await mark_error(payload.company_id, payload.phone, str(exc), "ERROR")
            raise WorkerError("TELEGRAM_VERIFY_CODE_FAILED", "Failed to verify Telegram code", 500) from exc


@app.post("/internal/telegram/verify-password", dependencies=[Depends(verify_internal_token)])
async def internal_verify_password(payload: VerifyPasswordRequest) -> dict:
    logger.info("verify-password requested for company=%s phone=%s", payload.company_id, payload.phone)
    async with concurrency_limiter:
        try:
            return await verify_password(payload.company_id, payload.phone, payload.password, crypto)
        except WorkerError:
            raise
        except Exception as exc:
            await mark_error(payload.company_id, payload.phone, str(exc), "ERROR")
            raise WorkerError("TELEGRAM_VERIFY_PASSWORD_FAILED", "Failed to verify Telegram password", 500) from exc


@app.post("/internal/telegram/start-login-qr", dependencies=[Depends(verify_internal_token)])
async def internal_start_login_qr(payload: StartLoginQrRequest) -> dict:
    logger.info("start-login-qr requested for company=%s channelAccount=%s", payload.company_id, payload.channel_account_id)
    async with concurrency_limiter:
        try:
            return await start_qr_login(payload.company_id, payload.channel_account_id, crypto)
        except WorkerError:
            raise
        except Exception as exc:
            raise WorkerError("TELEGRAM_QR_START_FAILED", f"Failed to start QR login: {exc}", 500) from exc


@app.post("/internal/telegram/poll-login-qr", dependencies=[Depends(verify_internal_token)])
async def internal_poll_login_qr(payload: PollLoginQrRequest) -> dict:
    return poll_qr_login(payload.qr_session_id)


@app.post("/internal/telegram/verify-password-qr", dependencies=[Depends(verify_internal_token)])
async def internal_verify_password_qr(payload: VerifyPasswordQrRequest) -> dict:
    logger.info("verify-password-qr requested for qrSessionId=%s", payload.qr_session_id)
    async with concurrency_limiter:
        try:
            return await verify_password_qr(payload.qr_session_id, payload.password, crypto)
        except WorkerError:
            raise
        except Exception as exc:
            raise WorkerError("TELEGRAM_VERIFY_PASSWORD_QR_FAILED", "Failed to verify Telegram password", 500) from exc


@app.post("/internal/telegram/sync", dependencies=[Depends(verify_internal_token)])
async def internal_sync(payload: SyncRequest) -> dict:
    logger.info("sync requested for company=%s channelAccount=%s", payload.company_id, payload.channel_account_id)
    async with concurrency_limiter:
        try:
            result = await safety_service.execute_sync(
                company_id=payload.company_id,
                channel_account_id=payload.channel_account_id,
                sync_coro_factory=lambda: run_initial_sync(
                    company_id=payload.company_id,
                    channel_account_id=payload.channel_account_id,
                    dialogs_limit=payload.dialogs_limit,
                    messages_per_dialog=payload.messages_per_dialog,
                    crypto=crypto,
                ),
            )
        except WorkerError:
            raise
        except Exception as exc:
            await mark_error_by_channel(
                payload.company_id, payload.channel_account_id, str(exc), "ERROR"
            )
            raise WorkerError("TELEGRAM_SYNC_FAILED", "Failed to sync Telegram dialogs", 500) from exc

        return {
            "status": "sync_completed",
            "dialogsSynced": result.dialogs_synced,
            "messagesSynced": result.messages_synced,
        }


@app.post("/internal/telegram/send-message", dependencies=[Depends(verify_internal_token)])
async def internal_send_message(payload: SendMessageRequest) -> dict:
    logger.info(
        "send-message requested for company=%s channelAccount=%s conversation=%s",
        payload.company_id,
        payload.channel_account_id,
        payload.external_conversation_id,
    )
    async with concurrency_limiter:
        try:
            return await safety_service.execute_send(
                company_id=payload.company_id,
                channel_account_id=payload.channel_account_id,
                external_conversation_id=payload.external_conversation_id,
                send_coro_factory=lambda: send_message(
                    company_id=payload.company_id,
                    channel_account_id=payload.channel_account_id,
                    external_conversation_id=payload.external_conversation_id,
                    text=payload.text,
                    crypto=crypto,
                ),
            )
        except WorkerError:
            raise
        except Exception as exc:
            raise WorkerError("TELEGRAM_SEND_FAILED", "Failed to send Telegram message", 500) from exc


@app.post("/internal/telegram/logout", dependencies=[Depends(verify_internal_token)])
async def internal_logout(payload: LogoutRequest) -> dict:
    logger.info("logout requested for company=%s channelAccount=%s", payload.company_id, payload.channel_account_id)
    async with concurrency_limiter:
        try:
            return await logout_and_clear_session(payload.company_id, payload.channel_account_id, crypto)
        except WorkerError:
            raise
        except Exception as exc:
            await mark_error_by_channel(payload.company_id, payload.channel_account_id, str(exc), "ERROR")
            raise WorkerError("TELEGRAM_LOGOUT_FAILED", "Failed to logout Telegram session", 500) from exc


@app.post("/internal/telegram/resolve-chat", dependencies=[Depends(verify_internal_token)])
async def internal_resolve_chat(payload: ResolveChatByLinkRequest) -> dict:
    logger.info("resolve-chat requested for company=%s channelAccount=%s", payload.company_id, payload.channel_account_id)
    async with concurrency_limiter:
        return await resolve_public_group_by_link(
            company_id=payload.company_id,
            channel_account_id=payload.channel_account_id,
            link=payload.link,
            crypto=crypto,
        )
