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
  /** Correlation id for internal system logs across the login flow. */
  traceId?: string;
};
