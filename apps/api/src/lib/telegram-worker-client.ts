import { AppError } from "./errors.js";

type WorkerPayload = Record<string, unknown>;

type WorkerSuccess = {
  status: string;
  requiresPassword?: boolean;
  details?: unknown;
};

type ResolveChatSuccess = {
  status: string;
  telegramChatId: string;
  chatTitle: string | null;
  chatType: "group" | "channel";
  username?: string | null;
};

const normalizeWorkerError = async (
  response: Response
): Promise<{ code?: string; message: string; details?: unknown }> => {
  try {
    const body = (await response.json()) as {
      error?: { code?: string; message?: string; details?: unknown };
    };
    if (body?.error?.message) {
      return { code: body.error.code, message: body.error.message, details: body.error.details };
    }
  } catch {
    // noop
  }

  return { message: `Telegram worker returned HTTP ${response.status}` };
};

export class TelegramWorkerClient {
  /**
   * @param resolveChatTimeoutMs — optional longer timeout for `/internal/telegram/resolve-chat`
   * (Telethon may need time for get_dialogs / get_entity on cold cache).
   */
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly resolveChatTimeoutMs?: number
  ) {}

  private async post(path: string, payload: WorkerPayload, timeoutOverrideMs?: number): Promise<WorkerSuccess> {
    const ms = timeoutOverrideMs ?? this.timeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ms);

    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": this.token
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const err = await normalizeWorkerError(response);
        // If worker returned a structured WorkerError, preserve its http status + code
        // so UI can render actionable instructions (e.g. join discussion group).
        throw new AppError(
          response.status,
          err.code ?? "TELEGRAM_WORKER_ERROR",
          err.message,
          err.details
        );
      }

      return (await response.json()) as WorkerSuccess;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new AppError(504, "TELEGRAM_WORKER_TIMEOUT", "Telegram worker request timed out");
      }

      throw new AppError(502, "TELEGRAM_WORKER_UNAVAILABLE", "Telegram worker is unavailable");
    } finally {
      clearTimeout(timeout);
    }
  }

  startLogin(payload: WorkerPayload) {
    return this.post("/internal/telegram/start-login", payload);
  }

  startLoginQr(payload: WorkerPayload) {
    return this.post("/internal/telegram/start-login-qr", payload);
  }

  pollLoginQr(payload: WorkerPayload) {
    return this.post("/internal/telegram/poll-login-qr", payload);
  }

  verifyPasswordQr(payload: WorkerPayload) {
    return this.post("/internal/telegram/verify-password-qr", payload);
  }

  verifyCode(payload: WorkerPayload) {
    return this.post("/internal/telegram/verify-code", payload);
  }

  verifyPassword(payload: WorkerPayload) {
    return this.post("/internal/telegram/verify-password", payload);
  }

  sync(payload: WorkerPayload) {
    return this.post("/internal/telegram/sync", payload);
  }

  sendMessage(payload: WorkerPayload) {
    return this.post("/internal/telegram/send-message", payload);
  }

  logout(payload: WorkerPayload) {
    return this.post("/internal/telegram/logout", payload);
  }

  resolveChat(payload: WorkerPayload) {
    const ms = this.resolveChatTimeoutMs ?? this.timeoutMs;
    return this.post("/internal/telegram/resolve-chat", payload, ms) as unknown as Promise<ResolveChatSuccess>;
  }
}
