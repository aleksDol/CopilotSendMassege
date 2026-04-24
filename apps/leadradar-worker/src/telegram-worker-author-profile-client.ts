export type TelegramWorkerFetchAuthorProfileInput = {
  telegramAccountId: string;
  telegramUserId?: string | null;
  username?: string | null;
};

export type TelegramWorkerAuthorProfile = {
  telegramUserId?: string | null;
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  linkedChannelId?: string | null;
  linkedChannelUsername?: string | null;
  linkedChannelTitle?: string | null;
  linkedChannelDescription?: string | null;
  rawProfileJson?: unknown | null;
};

type Logger = (level: "info" | "warn" | "error", message: string, extra?: Record<string, unknown>) => void;

const trimOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeWorkerError = async (response: Response): Promise<{ code?: string; message: string }> => {
  try {
    const body = (await response.json()) as { error?: { code?: string; message?: string } };
    if (body?.error?.message) {
      return { code: body.error.code, message: body.error.message };
    }
  } catch {
    // ignore
  }
  return { message: `Telegram worker returned HTTP ${response.status}` };
};

export class TelegramWorkerAuthorProfileClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly timeoutMs: number,
    private readonly log: Logger
  ) {}

  async fetchProfile(input: TelegramWorkerFetchAuthorProfileInput): Promise<TelegramWorkerAuthorProfile | null> {
    const payload = {
      telegramAccountId: input.telegramAccountId,
      telegramUserId: trimOrNull(input.telegramUserId),
      username: trimOrNull(input.username)
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/internal/telegram/fetch-user-profile`, {
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
        const isRateLimited = response.status === 429 || String(err.code ?? "").includes("LIMIT");
        this.log("warn", "author-profile fetch returned non-OK response", {
          status: response.status,
          code: err.code ?? null,
          message: err.message,
          rateLimited: isRateLimited,
          telegramAccountId: payload.telegramAccountId,
          telegramUserId: payload.telegramUserId,
          username: payload.username
        });
        return null;
      }

      const data = (await response.json()) as TelegramWorkerAuthorProfile;
      return {
        telegramUserId: trimOrNull(data.telegramUserId),
        username: trimOrNull(data.username),
        displayName: trimOrNull(data.displayName),
        bio: trimOrNull(data.bio),
        linkedChannelId: trimOrNull(data.linkedChannelId),
        linkedChannelUsername: trimOrNull(data.linkedChannelUsername),
        linkedChannelTitle: trimOrNull(data.linkedChannelTitle),
        linkedChannelDescription: trimOrNull(data.linkedChannelDescription),
        rawProfileJson: data.rawProfileJson ?? null
      };
    } catch (error) {
      const isAbort = error instanceof Error && error.name === "AbortError";
      this.log("warn", "author-profile fetch failed", {
        telegramAccountId: payload.telegramAccountId,
        telegramUserId: payload.telegramUserId,
        username: payload.username,
        timeoutMs: this.timeoutMs,
        aborted: isAbort,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    } finally {
      clearTimeout(timeout);
    }
  }
}
