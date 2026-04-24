import type { PrismaClient } from "@prisma/client";
import type { LeadAuthorProfileCacheRepository } from "../lead-author-profile-cache-repository.js";
import type {
  FindAuthorProfileCacheByTelegramUserInput,
  FindFreshAuthorProfileCacheInput,
  UpsertAuthorProfileCacheInput
} from "../../../types/repository-inputs.js";
import { leadRadarMappers } from "../../mappers.js";

export class PrismaLeadAuthorProfileCacheRepository implements LeadAuthorProfileCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findFreshByTelegramUserId(input: FindFreshAuthorProfileCacheInput) {
    const row = await this.prisma.leadRadarAuthorProfileCache.findFirst({
      where: {
        telegramAccountId: input.telegram_account_id,
        telegramUserId: input.telegram_user_id,
        expiresAt: { gt: input.now ?? new Date() }
      }
    });
    return row ? leadRadarMappers.authorProfileCache(row) : null;
  }

  async findAnyByTelegramUserId(input: FindAuthorProfileCacheByTelegramUserInput) {
    const row = await this.prisma.leadRadarAuthorProfileCache.findUnique({
      where: {
        telegramAccountId_telegramUserId: {
          telegramAccountId: input.telegram_account_id,
          telegramUserId: input.telegram_user_id
        }
      }
    });
    return row ? leadRadarMappers.authorProfileCache(row) : null;
  }

  async upsertProfileCache(input: UpsertAuthorProfileCacheInput) {
    const row = await this.prisma.leadRadarAuthorProfileCache.upsert({
      where: {
        telegramAccountId_telegramUserId: {
          telegramAccountId: input.telegram_account_id,
          telegramUserId: input.telegram_user_id
        }
      },
      update: {
        username: input.username ?? null,
        displayName: input.display_name ?? null,
        bio: input.bio ?? null,
        linkedChannelId: input.linked_channel_id ?? null,
        linkedChannelUsername: input.linked_channel_username ?? null,
        linkedChannelTitle: input.linked_channel_title ?? null,
        linkedChannelDescription: input.linked_channel_description ?? null,
        rawProfileJson: (input.raw_profile_json as any) ?? null,
        fetchedAt: input.fetched_at,
        expiresAt: input.expires_at
      },
      create: {
        telegramAccountId: input.telegram_account_id,
        telegramUserId: input.telegram_user_id,
        username: input.username ?? null,
        displayName: input.display_name ?? null,
        bio: input.bio ?? null,
        linkedChannelId: input.linked_channel_id ?? null,
        linkedChannelUsername: input.linked_channel_username ?? null,
        linkedChannelTitle: input.linked_channel_title ?? null,
        linkedChannelDescription: input.linked_channel_description ?? null,
        rawProfileJson: (input.raw_profile_json as any) ?? null,
        fetchedAt: input.fetched_at,
        expiresAt: input.expires_at
      }
    });
    return leadRadarMappers.authorProfileCache(row);
  }
}

