import type { PrismaClient } from "@prisma/client";
import { PrismaLeadKeywordRepository, PrismaLeadRepository, PrismaLeadSettingsRepository, PrismaLeadSourceRepository } from "./infrastructure/repositories/prisma/index.js";
import { LeadDeduplicationService } from "./application/services/lead-deduplication-service.js";
import { LeadMatchService } from "./application/services/lead-match-service.js";
import { LeadRadarIngestionService } from "./application/services/lead-radar-ingestion-service.js";
import { LeadScoringService } from "./application/services/lead-scoring-service.js";

export type LeadRadarLogger = {
  info: (msg: string) => void;
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

