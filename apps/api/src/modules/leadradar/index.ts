import type { FastifyPluginAsync } from "fastify";
import fp from "fastify-plugin";
import leadradarController from "./api/leadradar.controller.js";
import { PrismaLeadKeywordRepository, PrismaLeadRepository, PrismaLeadSettingsRepository, PrismaLeadSourceRepository } from "./infrastructure/repositories/prisma/index.js";
import { LeadCRMService } from "./application/services/lead-crm-service.js";
import { LeadDeduplicationService } from "./application/services/lead-deduplication-service.js";
import { LeadKeywordService } from "./application/services/lead-keyword-service.js";
import { LeadMatchService } from "./application/services/lead-match-service.js";
import { LeadRadarIngestionService } from "./application/services/lead-radar-ingestion-service.js";
import { LeadScoringService } from "./application/services/lead-scoring-service.js";
import { LeadSourceService } from "./application/services/lead-source-service.js";

const leadradarModuleImpl: FastifyPluginAsync = async (app) => {
  // Minimal DI container for LeadRadar (module-scoped).
  // No side-effects: this only creates instances and exposes them on app.
  const leadRepo = new PrismaLeadRepository(app.prisma);
  const sourceRepo = new PrismaLeadSourceRepository(app.prisma);
  const keywordRepo = new PrismaLeadKeywordRepository(app.prisma);
  const settingsRepo = new PrismaLeadSettingsRepository(app.prisma);

  const matchService = new LeadMatchService({ keywordRepo });
  const scoringService = new LeadScoringService();
  const dedupeService = new LeadDeduplicationService({ leadRepo });

  const ingestionService = new LeadRadarIngestionService({
    leadRepo,
    sourceRepo,
    settingsRepo,
    matchService,
    scoringService,
    dedupeService,
    prisma: app.prisma,
    logger: {
      info: (msg: string) => app.log.info(msg)
    }
  });

  const sourcesService = new LeadSourceService({ sourceRepo });
  const keywordsService = new LeadKeywordService({ keywordRepo });
  const crmService = new LeadCRMService({ leadRepo });

  // Expose via Fastify decorate so the rest of the module can access it later.
  if (!app.leadradar) {
    app.decorate("leadradar", {
      repositories: {
        lead: leadRepo,
        source: sourceRepo,
        keyword: keywordRepo,
        settings: settingsRepo
      },
      services: {
        ingestion: ingestionService,
        sources: sourcesService,
        keywords: keywordsService,
        match: matchService,
        scoring: scoringService,
        dedupe: dedupeService,
        crm: crmService
      }
    });
  }

  await app.register(leadradarController);
};

export default fp(leadradarModuleImpl, { name: "leadradar-module" });

