import type { PrismaClient } from "@prisma/client";
import { PrismaLeadKeywordRepository, PrismaLeadRepository, PrismaLeadSettingsRepository, PrismaLeadSourceRepository } from "./infrastructure/repositories/prisma/index.js";
import { LeadDeduplicationService } from "./application/services/lead-deduplication-service.js";
import { LeadMatchService } from "./application/services/lead-match-service.js";
import { LeadRadarIngestionService } from "./application/services/lead-radar-ingestion-service.js";
import { LeadScoringService } from "./application/services/lead-scoring-service.js";

export type LeadRadarLogger = {
  info: (msg: string) => void;
};

export function createLeadRadarIngestionService(params: { prisma: PrismaClient; logger?: LeadRadarLogger }) {
  const leadRepo = new PrismaLeadRepository(params.prisma);
  const sourceRepo = new PrismaLeadSourceRepository(params.prisma);
  const keywordRepo = new PrismaLeadKeywordRepository(params.prisma);
  const settingsRepo = new PrismaLeadSettingsRepository(params.prisma);

  const matchService = new LeadMatchService({ keywordRepo });
  const scoringService = new LeadScoringService();
  const dedupeService = new LeadDeduplicationService({ leadRepo });

  return new LeadRadarIngestionService({
    leadRepo,
    sourceRepo,
    settingsRepo,
    matchService,
    scoringService,
    dedupeService,
    prisma: params.prisma,
    logger: params.logger
  });
}

