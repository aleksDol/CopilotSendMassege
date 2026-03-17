import asyncio
import logging
import time

from fastapi import Depends, FastAPI
from fastapi.responses import JSONResponse

from app.auth import verify_internal_token
from app.config import settings
from app.crypto import SessionCrypto
from app.schemas import (
    LogoutRequest,
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
from app.services.sync_service import run_initial_sync, send_message

logger = logging.getLogger("telegram-worker")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

started_at = time.time()
concurrency_limiter = asyncio.Semaphore(settings.telegram_worker_concurrency)

app = FastAPI(title="telegram-worker", version="0.1.0")
crypto = SessionCrypto(settings.telegram_session_encryption_key)


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
    return {
        "uptimeSeconds": round(time.time() - started_at, 2),
        "configuredConcurrency": settings.telegram_worker_concurrency,
    }


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
            result = await run_initial_sync(
                company_id=payload.company_id,
                channel_account_id=payload.channel_account_id,
                dialogs_limit=payload.dialogs_limit,
                messages_per_dialog=payload.messages_per_dialog,
                crypto=crypto,
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
            return await send_message(
                company_id=payload.company_id,
                channel_account_id=payload.channel_account_id,
                external_conversation_id=payload.external_conversation_id,
                text=payload.text,
                crypto=crypto,
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
