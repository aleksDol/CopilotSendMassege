export type ResolvedChatPreview = {
  telegramChatId: string;
  title: string;
  chatType: string;
  username: string | null;
};

type CatalogEntryLike = {
  telegram_chat_id: string | null;
  telegram_username: string | null;
};

export function parseTelegramUsernameFromLink(link: string): string | null {
  const raw = link.trim();
  if (!raw) return null;

  if (raw.startsWith("@")) {
    const username = raw.slice(1).split(/[/?#]/)[0]?.trim();
    return username || null;
  }

  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = url.hostname.toLowerCase();
    if (host === "t.me" || host === "telegram.me" || host.endsWith(".t.me")) {
      const segment = url.pathname.replace(/^\/+/, "").split("/")[0]?.trim() ?? "";
      if (!segment || segment.startsWith("+") || segment.toLowerCase() === "joinchat") {
        return null;
      }
      return segment;
    }
  } catch {
    // fall through
  }

  if (/^[a-zA-Z0-9_]{4,}$/u.test(raw)) {
    return raw;
  }

  return null;
}

export function formatChatTypeLabel(chatType: string | null | undefined): string {
  if (chatType === "channel_comments") return "Канал с комментариями";
  if (chatType === "group") return "Группа";
  if (chatType === "channel") return "Канал";
  return chatType?.trim() || "—";
}

export function mapResolveError(error: unknown): string {
  const apiError = error as { code?: string; status?: number; message?: string } | null;
  if (!apiError || typeof apiError !== "object") {
    return "Не удалось получить информацию о чате. Проверьте ссылку.";
  }

  if (
    apiError.code === "UNSUPPORTED_CHAT_LINK" ||
    apiError.code === "UNSUPPORTED_CHAT_TYPE" ||
    (apiError.message ?? "").toLowerCase().includes("invite")
  ) {
    return "Этот чат нельзя добавить автоматически.";
  }

  if (apiError.code === "TELEGRAM_NOT_CONNECTED" || apiError.code === "RECONNECT_REQUIRED") {
    return "Подключите рабочий Telegram в настройках аккаунта.";
  }

  if (apiError.code === "CHAT_NOT_FOUND" || apiError.status === 404) {
    return "Не удалось получить информацию о чате. Проверьте ссылку.";
  }

  return apiError.message || "Не удалось получить информацию о чате. Проверьте ссылку.";
}

export function isCatalogEntryDuplicate(
  entries: CatalogEntryLike[],
  chatId: string,
  username: string | null
): boolean {
  const normalizedUsername = username?.trim().toLowerCase() || null;
  return entries.some((row) => {
    if (chatId && row.telegram_chat_id === chatId) return true;
    if (normalizedUsername && row.telegram_username?.toLowerCase() === normalizedUsername) return true;
    return false;
  });
}
