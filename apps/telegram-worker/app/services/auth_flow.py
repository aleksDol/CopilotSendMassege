from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

import psycopg
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
