export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

const TELEGRAM_SELECTION_ERROR_CODES = new Set([
  "TELEGRAM_ACCOUNT_FORBIDDEN",
  "TELEGRAM_ACCOUNT_NOT_AVAILABLE"
]);

const LEADRADAR_PARSING_SELECTION_ERROR_CODES = new Set([
  "TELEGRAM_ACCOUNT_FORBIDDEN",
  "TELEGRAM_ACCOUNT_NOT_AVAILABLE",
  "TELEGRAM_PARSING_DISABLED"
]);

const LEADRADAR_SENDING_SELECTION_ERROR_CODES = new Set([
  "TELEGRAM_ACCOUNT_FORBIDDEN",
  "TELEGRAM_ACCOUNT_NOT_AVAILABLE",
  "TELEGRAM_SENDING_DISABLED"
]);

export function isTelegramAccountSelectionError(error: unknown): error is ApiError {
  return error instanceof ApiError && Boolean(error.code && TELEGRAM_SELECTION_ERROR_CODES.has(error.code));
}

export function isLeadRadarParsingSelectionError(error: unknown): error is ApiError {
  return error instanceof ApiError && Boolean(error.code && LEADRADAR_PARSING_SELECTION_ERROR_CODES.has(error.code));
}

export function isLeadRadarSendingSelectionError(error: unknown): error is ApiError {
  return error instanceof ApiError && Boolean(error.code && LEADRADAR_SENDING_SELECTION_ERROR_CODES.has(error.code));
}
