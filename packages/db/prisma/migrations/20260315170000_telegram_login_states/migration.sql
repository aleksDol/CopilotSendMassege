-- Add auth flow helper column
ALTER TABLE "TelegramAccount"
ADD COLUMN "authPhoneCodeHash" TEXT;

-- Recreate enum with new Telegram connection lifecycle states
CREATE TYPE "TelegramLoginStatus_new" AS ENUM (
  'LOGIN_REQUIRED',
  'CODE_SENT',
  'PASSWORD_REQUIRED',
  'CONNECTED',
  'RECONNECT_REQUIRED',
  'LIMITED',
  'DISABLED',
  'ERROR'
);

ALTER TABLE "TelegramAccount"
ALTER COLUMN "loginStatus" DROP DEFAULT;

ALTER TABLE "TelegramAccount"
ALTER COLUMN "loginStatus" TYPE "TelegramLoginStatus_new"
USING (
  CASE "loginStatus"::text
    WHEN 'DISCONNECTED' THEN 'LOGIN_REQUIRED'
    WHEN 'PENDING_2FA' THEN 'PASSWORD_REQUIRED'
    WHEN 'AUTHORIZED' THEN 'CONNECTED'
    WHEN 'EXPIRED' THEN 'RECONNECT_REQUIRED'
    ELSE COALESCE("loginStatus"::text, 'LOGIN_REQUIRED')
  END
)::"TelegramLoginStatus_new";

DROP TYPE "TelegramLoginStatus";
ALTER TYPE "TelegramLoginStatus_new" RENAME TO "TelegramLoginStatus";

ALTER TABLE "TelegramAccount"
ALTER COLUMN "loginStatus" SET DEFAULT 'LOGIN_REQUIRED';
