export const TELEGRAM_AUTH_LOGIN_TTL_SECONDS = 600;

export const telegramAuthLoginKey = (loginToken: string) => `tg-auth:login:${loginToken}`;

export type TelegramAuthLoginStatus = "pending" | "confirmed";

export type TelegramAuthLoginSession = {
  status: TelegramAuthLoginStatus;
  telegramUserId?: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  photoUrl?: string | null;
  confirmedAt?: string;
};

export const parseLoginSession = (raw: string | null): TelegramAuthLoginSession | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as TelegramAuthLoginSession;
  } catch {
    return null;
  }
};

export const confirmCallbackPrefix = "tg_auth_confirm:";
