import { AppError, isAppError } from "./errors.js";

type ErrorDetails = {
  retryAfterSeconds?: unknown;
  limiterSource?: unknown;
};

const toPositiveInt = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.floor(value);
  return rounded > 0 ? rounded : null;
};

const formatRetryHintRu = (retryAfterSeconds?: number | null): string => {
  if (!retryAfterSeconds) return "";
  if (retryAfterSeconds < 60) return " Повторить можно примерно через минуту.";
  const minutes = Math.ceil(retryAfterSeconds / 60);
  if (minutes < 60) return ` Повторить можно примерно через ${minutes} мин.`;
  const hours = Math.ceil(minutes / 60);
  return ` Повторить можно примерно через ${hours} ч.`;
};

export const remapTelegramSendError = (error: unknown): never => {
  if (!isAppError(error)) throw error;

  const details = (error.details ?? {}) as ErrorDetails;
  const retryAfterSeconds = toPositiveInt(details.retryAfterSeconds);
  const limiterSource =
    typeof details.limiterSource === "string" ? details.limiterSource : undefined;

  const isRateLimited =
    error.code === "TELEGRAM_LIMITED" ||
    error.code === "TELEGRAM_THROTTLED" ||
    error.code === "SEND_RATE_LIMIT_PER_MINUTE" ||
    error.code === "SEND_RATE_LIMIT_PER_5_MINUTES" ||
    error.code === "NEW_CONVERSATION_RATE_LIMIT" ||
    error.code === "SAFETY_MODE_ACTIVE";

  if (!isRateLimited) throw error;

  const message =
    "Telegram временно ограничил отправку через подключенный аккаунт. Попробуйте позже или выберите другой аккаунт для отправки." +
    formatRetryHintRu(retryAfterSeconds);

  throw new AppError(429, "TELEGRAM_SEND_RATE_LIMITED", message, {
    retryAfterSeconds,
    limiterSource,
    upstreamCode: error.code,
  });
};

