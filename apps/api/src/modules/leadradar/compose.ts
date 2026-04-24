import type { PrismaClient } from "@prisma/client";
import {
  PrismaLeadAuthorProfileCacheRepository,
  PrismaLeadKeywordRepository,
  PrismaLeadRepository,
  PrismaLeadSettingsRepository,
  PrismaLeadSourceRepository
} from "./infrastructure/repositories/prisma/index.js";
import { LeadDeduplicationService } from "./application/services/lead-deduplication-service.js";
import { LeadMatchService } from "./application/services/lead-match-service.js";
import { LeadRadarIngestionService } from "./application/services/lead-radar-ingestion-service.js";
import { LeadScoringService } from "./application/services/lead-scoring-service.js";
import { AuthorProfileLeadDedupeService } from "./application/services/author-profile-lead-dedupe-service.js";
import { LeadRadarAuthorProfileMatchService } from "./application/services/lead-radar-author-profile-match-service.js";
import {
  LeadRadarAuthorProfileCheckJobService,
  type LeadRadarAuthorProfileCheckJobInput,
  type LeadRadarFetchedAuthorProfile
} from "./application/services/lead-radar-author-profile-check-job-service.js";

export type LeadRadarLogger = {
  info: (msg: string) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
};

export function createLeadRadarIngestionService(params: {
  prisma: PrismaClient;
  logger?: LeadRadarLogger;
  multiChatDedupeWindowHours?: number;
  multiChatScoreBonus?: number;
}) {
  const leadRepo = new PrismaLeadRepository(params.prisma);
  const sourceRepo = new PrismaLeadSourceRepository(params.prisma);
  const keywordRepo = new PrismaLeadKeywordRepository(params.prisma);
  const settingsRepo = new PrismaLeadSettingsRepository(params.prisma);

  const matchService = new LeadMatchService({ keywordRepo });
  const scoringService = new LeadScoringService();
  const dedupeService = new LeadDeduplicationService({ leadRepo });

  const dedupeH = params.multiChatDedupeWindowHours ?? Number(process.env.LEADRADAR_MULTI_CHAT_DEDUPE_WINDOW_HOURS ?? 3);
  const bonus = params.multiChatScoreBonus ?? Number(process.env.LEADRADAR_MULTI_CHAT_SCORE_BONUS ?? 35);

  return new LeadRadarIngestionService({
    leadRepo,
    sourceRepo,
    settingsRepo,
    matchService,
    scoringService,
    dedupeService,
    prisma: params.prisma,
    logger: params.logger,
    multiChatDedupeWindowHours: Number.isFinite(dedupeH) && dedupeH > 0 ? dedupeH : 3,
    multiChatScoreBonus: Number.isFinite(bonus) && bonus >= 0 ? bonus : 35
  });
}

export function createLeadRadarAuthorProfileCheckService(params: {
  prisma: PrismaClient;
  logger?: LeadRadarLogger;
  profileFetcher?: {
    fetchProfile: (input: {
      telegramAccountId: string;
      telegramUserId?: string | null;
      username?: string | null;
    }) => Promise<LeadRadarFetchedAuthorProfile | null>;
  };
}) {
  const leadRepo = new PrismaLeadRepository(params.prisma);
  const keywordRepo = new PrismaLeadKeywordRepository(params.prisma);
  const profileCacheRepo = new PrismaLeadAuthorProfileCacheRepository(params.prisma);

  const dedupeService = new AuthorProfileLeadDedupeService({ leadRepo });
  const matcher = new LeadRadarAuthorProfileMatchService({ keywordRepo });
  const service = new LeadRadarAuthorProfileCheckJobService({
    dedupeService,
    cacheRepo: profileCacheRepo,
    matcher,
    leadRepo,
    profileFetcher: params.profileFetcher,
    logger: params.logger
  });

  return {
    process: (input: LeadRadarAuthorProfileCheckJobInput) => service.process(input)
  };
}
