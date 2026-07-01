export const LEADRADAR_MARKETPLACE_CHAT_TOPICS_KEY = "leadradar-marketplace-chat-topics";
export const LEADRADAR_MARKETPLACE_KEYWORD_COUNT_KEY = "leadradar-marketplace-keyword-count";

export function readMarketplaceSetupContext(): { chatTopics: string[]; keywordCount: number } {
  if (typeof window === "undefined") {
    return { chatTopics: [], keywordCount: 0 };
  }

  let chatTopics: string[] = [];
  try {
    const raw = sessionStorage.getItem(LEADRADAR_MARKETPLACE_CHAT_TOPICS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        chatTopics = parsed.filter((item): item is string => typeof item === "string");
      }
    }
  } catch {
    chatTopics = [];
  }

  const keywordCountRaw = sessionStorage.getItem(LEADRADAR_MARKETPLACE_KEYWORD_COUNT_KEY);
  const keywordCount = keywordCountRaw ? Number.parseInt(keywordCountRaw, 10) : 0;

  return {
    chatTopics,
    keywordCount: Number.isFinite(keywordCount) && keywordCount >= 0 ? keywordCount : 0
  };
}

export function saveMarketplaceSetupContext(params: { chatTopics: string[]; keywordCount: number }) {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(LEADRADAR_MARKETPLACE_CHAT_TOPICS_KEY, JSON.stringify(params.chatTopics));
  sessionStorage.setItem(LEADRADAR_MARKETPLACE_KEYWORD_COUNT_KEY, String(params.keywordCount));
}
