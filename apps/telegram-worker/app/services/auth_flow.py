import asyncio
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import psycopg
from telethon import TelegramClient
from telethon.errors import (
    FloodWaitError,
    PasswordHashInvalidError,
    PhoneCodeExpiredError,
    PhoneCodeInvalidError,
    PhoneNumberInvalidError,
    SessionPasswordNeededError,
)

from app.crypto import SessionCrypto
from app.db import get_connection
from app.telegram_client import create_client

# In-memory store for QR login sessions (key: qr_session_id)
QR_LOGIN_SESSIONS: dict[str, dict[str, Any]] = {}
QR_LOGIN_TIMEOUT_SEC = 60


async def logout_and_clear_session(company_id: str, channel_account_id: str, crypto: SessionCrypto) -> dict[str, str]:
    """
    Best-effort logout from Telegram and clear stored session in DB.
    Designed to be idempotent and safe even if the session is already invalid.
    """
    now = _now()
    session_encrypted: str | None = None
    telegram_account_id: str | None = None

    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT ta."id" AS "telegramAccountId", ta."sessionDataEncrypted"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."companyId" = %s AND ta."channelAccountId" = %s AND ca."channelType" = 'TELEGRAM'
                LIMIT 1
                ''',
                (company_id, channel_account_id),
            )
            row = await cur.fetchone()

        if row:
            telegram_account_id = str(row["telegramAccountId"])
            session_encrypted = row.get("sessionDataEncrypted")

    # Best-effort remote logout (ignore failures)
    if session_encrypted:
        try:
            session = crypto.decrypt(session_encrypted)
            client = create_client(session)
            try:
                await client.connect()
                if await client.is_user_authorized():
                    try:
                        await client.log_out()
                    except Exception:
                        pass
            finally:
                try:
                    await client.disconnect()
                except Exception:
                    pass
        except Exception:
            pass

    # Clear DB session + mark disconnected
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                UPDATE "TelegramAccount"
                SET
                  "sessionDataEncrypted" = NULL,
                  "telegramUserId" = NULL,
                  "username" = NULL,
                  "apiDcId" = NULL,
                  "authPhoneCodeHash" = NULL,
                  "loginStatus" = 'LOGIN_REQUIRED',
                  "errorMessage" = NULL,
                  "lastEventAt" = %s,
                  "updatedAt" = %s
                WHERE "channelAccountId" = %s
                ''',
                (now, now, channel_account_id),
            )
            await cur.execute(
                '''
                UPDATE "ChannelAccount"
                SET "status" = 'DISCONNECTED', "updatedAt" = %s
                WHERE "id" = %s
                ''',
                (now, channel_account_id),
            )

    return {"status": "disconnected"}


async def _qr_login_wait_task(
    qr_session_id: str,
    qr_login: Any,
    client: TelegramClient,
    account: dict[str, Any],
    crypto: SessionCrypto,
    company_id: str,
    channel_account_id: str,
) -> None:
    state = QR_LOGIN_SESSIONS.get(qr_session_id)
    if not state:
        return
    try:
        await asyncio.wait_for(qr_login.wait(), timeout=QR_LOGIN_TIMEOUT_SEC)
    except asyncio.TimeoutError:
        state["status"] = "expired"
        try:
            await client.disconnect()
        except Exception:
            pass
        return
    except SessionPasswordNeededError:
        state["status"] = "password_required"
        return
    except Exception as exc:
        state["status"] = "error"
        state["error_message"] = str(exc)
        try:
            await client.disconnect()
        except Exception:
            pass
        return

    try:
        me = await client.get_me()
        encrypted_session = crypto.encrypt(client.session.save())
        display_name = " ".join(part for part in [me.first_name, me.last_name] if part).strip() or (me.username or str(me.id))
        phone = me.phone or ""
        api_dc_id = getattr(client.session, "dc_id", None)

        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET
                      "phone" = %s,
                      "sessionDataEncrypted" = %s,
                      "telegramUserId" = %s,
                      "username" = %s,
                      "apiDcId" = %s,
                      "authPhoneCodeHash" = NULL,
                      "loginStatus" = 'CONNECTED',
                      "errorMessage" = NULL,
                      "lastEventAt" = %s,
                      "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (
                        phone,
                        encrypted_session,
                        str(me.id),
                        me.username,
                        api_dc_id,
                        _now(),
                        _now(),
                        account["telegramAccountId"],
                    ),
                )
                await cur.execute(
                    '''
                    UPDATE "ChannelAccount"
                    SET "displayName" = %s, "status" = 'ACTIVE', "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (display_name, _now(), account["channelAccountId"]),
                )
        state["status"] = "connected"
    except Exception as exc:
        state["status"] = "error"
        state["error_message"] = str(exc)
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass


async def start_qr_login(company_id: str, channel_account_id: str, crypto: SessionCrypto) -> dict[str, Any]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT ta."id" AS "telegramAccountId", ta."channelAccountId", ta."phone"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."companyId" = %s AND ta."channelAccountId" = %s AND ca."channelType" = 'TELEGRAM'
                LIMIT 1
                ''',
                (company_id, channel_account_id),
            )
            row = await cur.fetchone()
    if not row:
        raise WorkerError("TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account is not initialized", 404)

    account = dict(row)
    client = create_client(None)
    qr_session_id = str(uuid.uuid4())
    now_ts = datetime.now(timezone.utc).timestamp()
    expires_at = now_ts + QR_LOGIN_TIMEOUT_SEC

    state: dict[str, Any] = {
        "status": "pending",
        "account": account,
        "client": client,
        "company_id": company_id,
        "channel_account_id": channel_account_id,
        "expires_at": expires_at,
        "qr_url": None,
    }
    QR_LOGIN_SESSIONS[qr_session_id] = state

    try:
        await client.connect()
        qr_login = await client.qr_login()
        state["qr_url"] = qr_login.url
        asyncio.create_task(
            _qr_login_wait_task(
                qr_session_id, qr_login, client, account, crypto, company_id, channel_account_id
            )
        )
    except Exception as exc:
        state["status"] = "error"
        state["error_message"] = str(exc)
        try:
            await client.disconnect()
        except Exception:
            pass
        QR_LOGIN_SESSIONS.pop(qr_session_id, None)
        raise WorkerError("TELEGRAM_QR_START_FAILED", f"Failed to start QR login: {exc}", 500) from exc

    return {
        "qrSessionId": qr_session_id,
        "qrUrl": state["qr_url"],
        "expiresAt": int(expires_at * 1000),
    }


def poll_qr_login(qr_session_id: str) -> dict[str, Any]:
    state = QR_LOGIN_SESSIONS.get(qr_session_id)
    if not state:
        return {"status": "expired", "expiresAt": 0, "errorMessage": None}
    now_ts = datetime.now(timezone.utc).timestamp()
    if state.get("expires_at") and now_ts > state["expires_at"] and state.get("status") == "pending":
        state["status"] = "expired"
    return {
        "status": state["status"],
        "expiresAt": int((state.get("expires_at") or 0) * 1000),
        "errorMessage": state.get("error_message"),
    }


async def verify_password_qr(qr_session_id: str, password: str, crypto: SessionCrypto) -> dict[str, Any]:
    state = QR_LOGIN_SESSIONS.get(qr_session_id)
    if not state:
        raise WorkerError("QR_SESSION_EXPIRED", "QR session not found or expired", 404)
    if state.get("status") != "password_required":
        raise WorkerError("QR_PASSWORD_NOT_NEEDED", "Session is not waiting for password", 400)
    client: TelegramClient = state["client"]
    account = state["account"]
    try:
        await client.sign_in(password=password)
    except PasswordHashInvalidError as exc:
        raise WorkerError("INVALID_PASSWORD", "Invalid Telegram 2FA password", 400) from exc
    except Exception as exc:
        state["status"] = "error"
        state["error_message"] = str(exc)
        raise WorkerError("TELEGRAM_VERIFY_PASSWORD_FAILED", "Failed to verify Telegram password", 500) from exc

    result: dict[str, Any] = {"status": "connected", "requiresPassword": False}
    try:
        me = await client.get_me()
        encrypted_session = crypto.encrypt(client.session.save())
        display_name = " ".join(part for part in [me.first_name, me.last_name] if part).strip() or (me.username or str(me.id))
        phone = me.phone or ""
        api_dc_id = getattr(client.session, "dc_id", None)

        async with get_connection() as conn:
            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET
                      "phone" = %s,
                      "sessionDataEncrypted" = %s,
                      "telegramUserId" = %s,
                      "username" = %s,
                      "apiDcId" = %s,
                      "authPhoneCodeHash" = NULL,
                      "loginStatus" = 'CONNECTED',
                      "errorMessage" = NULL,
                      "lastEventAt" = %s,
                      "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (
                        phone,
                        encrypted_session,
                        str(me.id),
                        me.username,
                        api_dc_id,
                        _now(),
                        _now(),
                        account["telegramAccountId"],
                    ),
                )
                await cur.execute(
                    '''
                    UPDATE "ChannelAccount"
                    SET "displayName" = %s, "status" = 'ACTIVE', "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (display_name, _now(), account["channelAccountId"]),
                )
        state["status"] = "connected"
    finally:
        try:
            await client.disconnect()
        except Exception:
            pass
        QR_LOGIN_SESSIONS.pop(qr_session_id, None)

    return result


@dataclass
class WorkerError(Exception):
    code: str
    message: str
    status_code: int = 400


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def _load_account(conn: psycopg.AsyncConnection, company_id: str, phone: str) -> dict[str, Any]:
    async with conn.cursor() as cur:
        await cur.execute(
            '''
            SELECT
              ta."id" AS "telegramAccountId",
              ta."channelAccountId",
              ta."phone",
              ta."sessionDataEncrypted",
              ta."authPhoneCodeHash",
              ta."loginStatus",
              ca."companyId"
            FROM "TelegramAccount" ta
            JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
            WHERE ca."companyId" = %s
              AND ca."channelType" = 'TELEGRAM'
              AND ta."phone" = %s
            LIMIT 1
            ''',
            (company_id, phone),
        )
        account = await cur.fetchone()

    if not account:
        raise WorkerError("TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found for workspace", 404)

    return account


async def _save_connected_state(
    conn: psycopg.AsyncConnection,
    account: dict[str, Any],
    encrypted_session: str,
    telegram_user_id: str,
    username: str | None,
    display_name: str,
    api_dc_id: int | None,
) -> None:
    now = _now()

    async with conn.cursor() as cur:
        await cur.execute(
            '''
            UPDATE "TelegramAccount"
            SET
              "sessionDataEncrypted" = %s,
              "telegramUserId" = %s,
              "username" = %s,
              "apiDcId" = %s,
              "authPhoneCodeHash" = NULL,
              "loginStatus" = 'CONNECTED',
              "errorMessage" = NULL,
              "lastEventAt" = %s,
              "updatedAt" = %s
            WHERE "id" = %s
            ''',
            (
                encrypted_session,
                telegram_user_id,
                username,
                api_dc_id,
                now,
                now,
                account["telegramAccountId"],
            ),
        )

        await cur.execute(
            '''
            UPDATE "ChannelAccount"
            SET
              "displayName" = %s,
              "status" = 'ACTIVE',
              "updatedAt" = %s
            WHERE "id" = %s
            ''',
            (display_name, now, account["channelAccountId"]),
        )


async def start_login(company_id: str, channel_account_id: str, phone: str, crypto: SessionCrypto) -> dict[str, Any]:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT ta."id" AS "telegramAccountId", ta."sessionDataEncrypted", ta."phone", ta."channelAccountId"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."companyId" = %s AND ta."channelAccountId" = %s AND ca."channelType" = 'TELEGRAM'
                LIMIT 1
                ''',
                (company_id, channel_account_id),
            )
            account = await cur.fetchone()

        if not account:
            raise WorkerError("TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account is not initialized", 404)

        session = crypto.decrypt(account["sessionDataEncrypted"]) if account.get("sessionDataEncrypted") else ""
        client = create_client(session)

        try:
            await client.connect()
            sent = await client.send_code_request(phone)
            now = _now()

            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET
                      "phone" = %s,
                      "authPhoneCodeHash" = %s,
                      "loginStatus" = 'CODE_SENT',
                      "errorMessage" = NULL,
                      "lastEventAt" = %s,
                      "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (phone, sent.phone_code_hash, now, now, account["telegramAccountId"]),
                )

                await cur.execute(
                    '''
                    UPDATE "ChannelAccount"
                    SET "status" = 'CONNECTING', "updatedAt" = %s
                    WHERE "id" = %s
                    ''',
                    (now, account["channelAccountId"]),
                )

            return {"status": "code_sent", "requiresPassword": False}
        except PhoneNumberInvalidError as exc:
            raise WorkerError("INVALID_PHONE", "Invalid Telegram phone number", 400) from exc
        except FloodWaitError as exc:
            raise WorkerError("TELEGRAM_LIMITED", f"Telegram rate limited. Retry in {exc.seconds}s", 429) from exc
        except Exception as exc:
            raise WorkerError("TELEGRAM_START_FAILED", "Failed to start Telegram login", 500) from exc
        finally:
            await client.disconnect()


async def verify_code(company_id: str, phone: str, code: str, crypto: SessionCrypto) -> dict[str, Any]:
    async with get_connection() as conn:
        account = await _load_account(conn, company_id, phone)

        if not account.get("authPhoneCodeHash"):
            raise WorkerError("CODE_NOT_REQUESTED", "Code was not requested for this account", 400)

        session = crypto.decrypt(account["sessionDataEncrypted"]) if account.get("sessionDataEncrypted") else ""
        client = create_client(session)

        try:
            await client.connect()
            await client.sign_in(phone=phone, code=code, phone_code_hash=account["authPhoneCodeHash"])
        except SessionPasswordNeededError:
            now = _now()
            async with conn.cursor() as cur:
                await cur.execute(
                    '''
                    UPDATE "TelegramAccount"
                    SET "loginStatus" = 'PASSWORD_REQUIRED', "lastEventAt" = %s, "updatedAt" = %s, "errorMessage" = NULL
                    WHERE "id" = %s
                    ''',
                    (now, now, account["telegramAccountId"]),
                )
            return {"status": "password_required", "requiresPassword": True}
        except PhoneCodeInvalidError as exc:
            raise WorkerError("INVALID_CODE", "Invalid Telegram verification code", 400) from exc
        except PhoneCodeExpiredError as exc:
            raise WorkerError("CODE_EXPIRED", "Telegram verification code expired", 400) from exc
        except FloodWaitError as exc:
            raise WorkerError("TELEGRAM_LIMITED", f"Telegram rate limited. Retry in {exc.seconds}s", 429) from exc
        except Exception as exc:
            raise WorkerError("TELEGRAM_VERIFY_CODE_FAILED", "Failed to verify Telegram code", 500) from exc
        else:
            me = await client.get_me()
            encrypted_session = crypto.encrypt(client.session.save())
            display_name = " ".join(part for part in [me.first_name, me.last_name] if part).strip() or (me.username or phone)
            api_dc_id = getattr(client.session, "dc_id", None)

            await _save_connected_state(
                conn=conn,
                account=account,
                encrypted_session=encrypted_session,
                telegram_user_id=str(me.id),
                username=me.username,
                display_name=display_name,
                api_dc_id=api_dc_id,
            )

            return {"status": "connected", "requiresPassword": False}
        finally:
            await client.disconnect()


async def verify_password(company_id: str, phone: str, password: str, crypto: SessionCrypto) -> dict[str, Any]:
    async with get_connection() as conn:
        account = await _load_account(conn, company_id, phone)

        session = crypto.decrypt(account["sessionDataEncrypted"]) if account.get("sessionDataEncrypted") else ""
        client = create_client(session)

        try:
            await client.connect()
            await client.sign_in(password=password)
            me = await client.get_me()
            encrypted_session = crypto.encrypt(client.session.save())
            display_name = " ".join(part for part in [me.first_name, me.last_name] if part).strip() or (me.username or phone)
            api_dc_id = getattr(client.session, "dc_id", None)

            await _save_connected_state(
                conn=conn,
                account=account,
                encrypted_session=encrypted_session,
                telegram_user_id=str(me.id),
                username=me.username,
                display_name=display_name,
                api_dc_id=api_dc_id,
            )

            return {"status": "connected", "requiresPassword": False}
        except PasswordHashInvalidError as exc:
            raise WorkerError("INVALID_PASSWORD", "Invalid Telegram 2FA password", 400) from exc
        except FloodWaitError as exc:
            raise WorkerError("TELEGRAM_LIMITED", f"Telegram rate limited. Retry in {exc.seconds}s", 429) from exc
        except Exception as exc:
            raise WorkerError("TELEGRAM_VERIFY_PASSWORD_FAILED", "Failed to verify Telegram password", 500) from exc
        finally:
            await client.disconnect()


async def mark_error(company_id: str, phone: str, error_message: str, status: str = "ERROR") -> None:
    async with get_connection() as conn:
        account = await _load_account(conn, company_id, phone)
        now = _now()

        async with conn.cursor() as cur:
            await cur.execute(
                '''
                UPDATE "TelegramAccount"
                SET "loginStatus" = %s::"TelegramLoginStatus", "errorMessage" = %s, "lastEventAt" = %s, "updatedAt" = %s
                WHERE "id" = %s
                ''',
                (status, error_message, now, now, account["telegramAccountId"]),
            )
            await cur.execute(
                '''
                UPDATE "ChannelAccount"
                SET "status" = 'ERROR', "updatedAt" = %s
                WHERE "id" = %s
                ''',
                (now, account["channelAccountId"]),
            )


async def mark_error_by_channel(
    company_id: str, channel_account_id: str, error_message: str, status: str = "ERROR"
) -> None:
    async with get_connection() as conn:
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                SELECT ta."id" AS "telegramAccountId", ta."channelAccountId"
                FROM "TelegramAccount" ta
                JOIN "ChannelAccount" ca ON ca."id" = ta."channelAccountId"
                WHERE ca."companyId" = %s AND ta."channelAccountId" = %s AND ca."channelType" = 'TELEGRAM'
                LIMIT 1
                ''',
                (company_id, channel_account_id),
            )
            account = await cur.fetchone()
        if not account:
            return
        now = _now()
        async with conn.cursor() as cur:
            await cur.execute(
                '''
                UPDATE "TelegramAccount"
                SET "loginStatus" = %s::"TelegramLoginStatus", "errorMessage" = %s, "lastEventAt" = %s, "updatedAt" = %s
                WHERE "id" = %s
                ''',
                (status, error_message, now, now, account["telegramAccountId"]),
            )
            await cur.execute(
                '''
                UPDATE "ChannelAccount"
                SET "status" = 'ERROR', "updatedAt" = %s
                WHERE "id" = %s
                ''',
                (now, account["channelAccountId"]),
            )
