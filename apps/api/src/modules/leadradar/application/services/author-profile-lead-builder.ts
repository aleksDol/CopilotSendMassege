import type { AuthorProfileCache } from "../../domain/entities/author-profile-cache.js";
import { LeadStatus } from "../../domain/enums/lead-status.js";
import type { CreateLeadInput } from "../../types/repository-inputs.js";
import type { LeadRadarAuthorProfileCheckJobInput } from "./lead-radar-author-profile-check-job-service.js";
import type { LeadRadarAuthorProfileMatchResult } from "./lead-radar-author-profile-match-service.js";

const FALLBACK_REASON = "Author profile matched by keywords";
const MESSAGE_TEXT_MAX_LENGTH = 220;
const CONTEXT_PREVIEW_MAX_LENGTH = 240;

const trimOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeUsername = (value: string | null | undefined): string | null => {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  return trimmed.replace(/^@+/u, "").toLowerCase();
};

const shorten = (value: string, maxLen: number): string =>
  value.length <= maxLen ? value : `${value.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;

const parseDateOrNow = (raw: string | null | undefined, now: Date): Date => {
  const value = trimOrNull(raw);
  if (!value) return now;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? now : parsed;
};

const buildSyntheticMessageId = (params: {
  telegramUserId: string | null;
  usernameNormalized: string | null;
  fallbackSourceMessageId: string;
}) => {
  if (params.telegramUserId) return `author-profile:${params.telegramUserId}`;
  if (params.usernameNormalized) return `author-profile:username:${params.usernameNormalized}`;
  return params.fallbackSourceMessageId;
};

export const buildAuthorProfileLeadCreateInput = (params: {
  payload: LeadRadarAuthorProfileCheckJobInput;
  matchResult: LeadRadarAuthorProfileMatchResult;
  cache?: AuthorProfileCache | null;
  resolvedTelegramUserId?: string | null;
  resolvedUsername?: string | null;
  resolvedDisplayName?: string | null;
  now?: Date;
}): CreateLeadInput | null => {
  const now = params.now ?? new Date();
  const telegramUserId = trimOrNull(params.resolvedTelegramUserId ?? params.payload.telegramUserId ?? params.cache?.telegram_user_id);
  const username = normalizeUsername(params.resolvedUsername ?? params.cache?.username ?? params.payload.username);
  const displayName = trimOrNull(params.resolvedDisplayName ?? params.cache?.display_name ?? params.payload.displayName);
  if (!telegramUserId && !username) return null;

  const reason = shorten(trimOrNull(params.matchResult.reason) ?? FALLBACK_REASON, MESSAGE_TEXT_MAX_LENGTH);
  const messageDate = parseDateOrNow(params.payload.sourceMessageDate, now);

  return {
    user_id: params.payload.userId,
    telegram_account_id: params.payload.telegramAccountId,
    telegram_user_id: telegramUserId,
    username,
    display_name: displayName,
    chat_id: params.payload.sourceChatId,
    chat_title: trimOrNull(params.payload.sourceChatTitle) ?? "Telegram",
    source_type: "author_profile",
    related_post_id: trimOrNull(params.payload.relatedPostId),
    context_preview: (() => {
      const value = trimOrNull(params.payload.contextPreview);
      if (!value) return null;
      return shorten(value, CONTEXT_PREVIEW_MAX_LENGTH);
    })(),
    message_id: buildSyntheticMessageId({
      telegramUserId,
      usernameNormalized: username,
      fallbackSourceMessageId: params.payload.sourceMessageId
    }),
    message_text: reason,
    message_date: messageDate,
    matched_keywords_json: {
      matched: true,
      source: "author_profile",
      reason,
      matchedKeywords: params.matchResult.matchedKeywords
    },
    score: params.matchResult.score,
    lead_type: null,
    status: LeadStatus.NEW,
    notes: null,
    contacted_at: null,
    context: null,
    initial_event: null
  };
};
