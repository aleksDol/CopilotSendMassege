import type { LeadAuthorProfileCacheRepository } from "../../infrastructure/repositories/lead-author-profile-cache-repository.js";
import type { LeadRepository } from "../../infrastructure/repositories/lead-repository.js";
import { AuthorProfileLeadDedupeService } from "./author-profile-lead-dedupe-service.js";
import {
  LeadRadarAuthorProfileMatchService,
  type LeadRadarAuthorProfileMatchResult
} from "./lead-radar-author-profile-match-service.js";
import { buildAuthorProfileLeadCreateInput } from "./author-profile-lead-builder.js";
import { buildAuthorProfileCacheInput } from "./author-profile-cache-builder.js";
import { Prisma } from "@prisma/client";

export type LeadRadarAuthorProfileCheckJobInput = {
  userId: string;
  telegramAccountId: string;
  telegramUserId?: string | null;
  sourceChatId: string;
  sourceChatTitle?: string | null;
  sourceMessageId: string;
  sourceMessageDate?: string | null;
  sourceType?: string | null;
  username?: string | null;
  displayName?: string | null;
  contextPreview?: string | null;
  relatedPostId?: string | null;
};

export type LeadRadarAuthorProfileCheckJobResult = {
  matched: boolean;
  score: number;
  matchedKeywordsCount: number;
  usedCache: boolean;
  skippedReason?:
    | "missing_author_identity"
    | "existing_author_profile_lead"
    | "no_match"
    | "non_positive_score"
    | "duplicate_on_create";
  createdLeadId?: string;
  match?: LeadRadarAuthorProfileMatchResult;
};

export type LeadRadarFetchedAuthorProfile = {
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

const normalizeUsername = (raw: string | null | undefined): string | null => {
  const t = raw?.trim();
  if (!t) return null;
  return t.replace(/^@+/u, "").toLowerCase();
};

const trimOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export class LeadRadarAuthorProfileCheckJobService {
  constructor(
    private readonly deps: {
      dedupeService: AuthorProfileLeadDedupeService;
      cacheRepo: LeadAuthorProfileCacheRepository;
      matcher: LeadRadarAuthorProfileMatchService;
      leadRepo: LeadRepository;
      profileFetcher?: {
        fetchProfile: (input: {
          telegramAccountId: string;
          telegramUserId?: string | null;
          username?: string | null;
        }) => Promise<LeadRadarFetchedAuthorProfile | null>;
      };
      logger?: {
        warn?: (message: string, meta?: Record<string, unknown>) => void;
      };
    }
  ) {}

  async process(input: LeadRadarAuthorProfileCheckJobInput): Promise<LeadRadarAuthorProfileCheckJobResult> {
    const telegramUserId = input.telegramUserId?.trim() || null;
    const usernameNormalized = normalizeUsername(input.username);

    if (!telegramUserId && !usernameNormalized) {
      return {
        matched: false,
        score: 0,
        matchedKeywordsCount: 0,
        usedCache: false,
        skippedReason: "missing_author_identity"
      };
    }

    const existing = await this.deps.dedupeService.findExistingAuthorProfileLead({
      telegramAccountId: input.telegramAccountId,
      telegramUserId,
      username: usernameNormalized
    });
    if (existing) {
      return {
        matched: false,
        score: 0,
        matchedKeywordsCount: 0,
        usedCache: false,
        skippedReason: "existing_author_profile_lead"
      };
    }

    let profileCache =
      telegramUserId != null
        ? await this.deps.cacheRepo.findFreshByTelegramUserId({
            telegram_account_id: input.telegramAccountId,
            telegram_user_id: telegramUserId
          })
        : null;
    let usedCache = Boolean(profileCache);
    let fetchedProfile: LeadRadarFetchedAuthorProfile | null = null;

    if (!profileCache && this.deps.profileFetcher) {
      try {
        fetchedProfile = await this.deps.profileFetcher.fetchProfile({
          telegramAccountId: input.telegramAccountId,
          telegramUserId,
          username: input.username ?? null
        });
      } catch (err) {
        this.deps.logger?.warn?.("LeadRadar author-profile fetch failed", {
          telegramAccountId: input.telegramAccountId,
          telegramUserId,
          username: input.username ?? null,
          error: err instanceof Error ? err.message : String(err)
        });
      }

      if (fetchedProfile) {
        const fetchedTelegramUserId = trimOrNull(fetchedProfile.telegramUserId) ?? telegramUserId;
        if (fetchedTelegramUserId) {
          try {
            profileCache = await this.deps.cacheRepo.upsertProfileCache(
              buildAuthorProfileCacheInput({
                telegramAccountId: input.telegramAccountId,
                telegramUserId: fetchedTelegramUserId,
                username: fetchedProfile.username ?? null,
                displayName: fetchedProfile.displayName ?? null,
                bio: fetchedProfile.bio ?? null,
                linkedChannelId: fetchedProfile.linkedChannelId ?? null,
                linkedChannelUsername: fetchedProfile.linkedChannelUsername ?? null,
                linkedChannelTitle: fetchedProfile.linkedChannelTitle ?? null,
                linkedChannelDescription: fetchedProfile.linkedChannelDescription ?? null,
                rawProfileJson: fetchedProfile.rawProfileJson ?? null,
                now: new Date()
              })
            );
            usedCache = true;
          } catch (err) {
            this.deps.logger?.warn?.("LeadRadar author-profile cache upsert failed", {
              telegramAccountId: input.telegramAccountId,
              telegramUserId: fetchedTelegramUserId,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      }
    }

    const resolvedTelegramUserId =
      trimOrNull(profileCache?.telegram_user_id) ?? trimOrNull(fetchedProfile?.telegramUserId) ?? telegramUserId;

    const match = await this.deps.matcher.match({
      userId: input.userId,
      telegramAccountId: input.telegramAccountId,
      telegramUserId: resolvedTelegramUserId ?? usernameNormalized ?? "unknown",
      username: profileCache?.username ?? fetchedProfile?.username ?? input.username ?? null,
      displayName: profileCache?.display_name ?? fetchedProfile?.displayName ?? input.displayName ?? null,
      bio: profileCache?.bio ?? fetchedProfile?.bio ?? null,
      linkedChannelUsername:
        profileCache?.linked_channel_username ?? fetchedProfile?.linkedChannelUsername ?? null,
      linkedChannelTitle: profileCache?.linked_channel_title ?? fetchedProfile?.linkedChannelTitle ?? null,
      linkedChannelDescription:
        profileCache?.linked_channel_description ?? fetchedProfile?.linkedChannelDescription ?? null,
      rawProfileJson: profileCache?.raw_profile_json ?? fetchedProfile?.rawProfileJson ?? null
    });

    if (!match.matched) {
      return {
        matched: false,
        score: match.score,
        matchedKeywordsCount: match.matchedKeywords.length,
        usedCache,
        skippedReason: "no_match",
        match
      };
    }

    if (!Number.isFinite(match.score) || match.score <= 0) {
      return {
        matched: true,
        score: match.score,
        matchedKeywordsCount: match.matchedKeywords.length,
        usedCache,
        skippedReason: "non_positive_score",
        match
      };
    }

    const createInput = buildAuthorProfileLeadCreateInput({
      payload: input,
      matchResult: match,
      cache: profileCache,
      resolvedTelegramUserId,
      resolvedUsername: profileCache?.username ?? fetchedProfile?.username ?? input.username ?? null,
      resolvedDisplayName: profileCache?.display_name ?? fetchedProfile?.displayName ?? input.displayName ?? null,
      now: new Date()
    });
    if (!createInput) {
      return {
        matched: true,
        score: match.score,
        matchedKeywordsCount: match.matchedKeywords.length,
        usedCache,
        skippedReason: "missing_author_identity",
        match
      };
    }

    const existingBeforeCreate = await this.deps.dedupeService.findExistingAuthorProfileLead({
      telegramAccountId: input.telegramAccountId,
      telegramUserId: createInput.telegram_user_id,
      username: createInput.username
    });
    if (existingBeforeCreate) {
      return {
        matched: true,
        score: match.score,
        matchedKeywordsCount: match.matchedKeywords.length,
        usedCache,
        skippedReason: "existing_author_profile_lead",
        match
      };
    }

    try {
      const created = await this.deps.leadRepo.createLead(createInput);
      return {
        matched: match.matched,
        score: match.score,
        matchedKeywordsCount: match.matchedKeywords.length,
        usedCache,
        createdLeadId: created.id,
        match
      };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return {
          matched: true,
          score: match.score,
          matchedKeywordsCount: match.matchedKeywords.length,
          usedCache,
          skippedReason: "duplicate_on_create",
          match
        };
      }
      throw err;
    }

  }
}
