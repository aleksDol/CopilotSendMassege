import type { UpsertAuthorProfileCacheInput } from "../../types/repository-inputs.js";

export const DEFAULT_AUTHOR_PROFILE_CACHE_TTL_DAYS = 14;

const trimOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const buildAuthorProfileCacheInput = (params: {
  telegramAccountId: string;
  telegramUserId: string;
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  linkedChannelId?: string | null;
  linkedChannelUsername?: string | null;
  linkedChannelTitle?: string | null;
  linkedChannelDescription?: string | null;
  rawProfileJson?: unknown | null;
  now?: Date;
}): UpsertAuthorProfileCacheInput => {
  const telegram_account_id = (params.telegramAccountId ?? "").trim();
  const telegram_user_id = (params.telegramUserId ?? "").trim();
  if (!telegram_account_id) {
    throw new Error("telegramAccountId is required");
  }
  if (!telegram_user_id) {
    throw new Error("telegramUserId is required");
  }

  const now = params.now ?? new Date();
  const expiresAtMs = now.getTime() + DEFAULT_AUTHOR_PROFILE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;

  return {
    telegram_account_id,
    telegram_user_id,
    username: trimOrNull(params.username),
    display_name: trimOrNull(params.displayName),
    bio: trimOrNull(params.bio),
    linked_channel_id: trimOrNull(params.linkedChannelId),
    linked_channel_username: trimOrNull(params.linkedChannelUsername),
    linked_channel_title: trimOrNull(params.linkedChannelTitle),
    linked_channel_description: trimOrNull(params.linkedChannelDescription),
    raw_profile_json: params.rawProfileJson ?? null,
    fetched_at: now,
    expires_at: new Date(expiresAtMs)
  };
};

