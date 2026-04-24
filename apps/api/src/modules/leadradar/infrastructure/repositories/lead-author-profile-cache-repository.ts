import type { AuthorProfileCache } from "../../domain/entities/author-profile-cache.js";
import type {
  FindAuthorProfileCacheByTelegramUserInput,
  FindFreshAuthorProfileCacheInput,
  UpsertAuthorProfileCacheInput
} from "../../types/repository-inputs.js";

export interface LeadAuthorProfileCacheRepository {
  findFreshByTelegramUserId(input: FindFreshAuthorProfileCacheInput): Promise<AuthorProfileCache | null>;
  findAnyByTelegramUserId(input: FindAuthorProfileCacheByTelegramUserInput): Promise<AuthorProfileCache | null>;
  upsertProfileCache(input: UpsertAuthorProfileCacheInput): Promise<AuthorProfileCache>;
}

