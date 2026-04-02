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

const normalizeWorkerError = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body?.error?.message) {
      return body.error.message;
    }
  } catch {
    // noop
  }

  return `Telegram worker returned HTTP ${response.status}`;
};

export class TelegramWorkerClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number
  ) {}

  private async post(path: string, payload: WorkerPayload): Promise<WorkerSuccess> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

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
        const message = await normalizeWorkerError(response);

        throw new AppError(502, "TELEGRAM_WORKER_ERROR", message);
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
    return this.post("/internal/telegram/resolve-chat", payload) as unknown as Promise<ResolveChatSuccess>;
  }
}
