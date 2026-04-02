import type { Plan, UserRole } from "@prisma/client";
import type { AppConfig } from "../config/index.js";
import type { PrismaClient } from "@prisma/client";
import type Redis from "ioredis";
import type { LeadRepository } from "../modules/leadradar/infrastructure/repositories/lead-repository.js";
import type { LeadSourceRepository } from "../modules/leadradar/infrastructure/repositories/lead-source-repository.js";
import type { LeadKeywordRepository } from "../modules/leadradar/infrastructure/repositories/lead-keyword-repository.js";
import type { LeadSettingsRepository } from "../modules/leadradar/infrastructure/repositories/lead-settings-repository.js";
import type { LeadRadarIngestionService } from "../modules/leadradar/application/services/lead-radar-ingestion-service.js";
import type { LeadSourceService } from "../modules/leadradar/application/services/lead-source-service.js";
import type { LeadKeywordService } from "../modules/leadradar/application/services/lead-keyword-service.js";
import type { LeadMatchService } from "../modules/leadradar/application/services/lead-match-service.js";
import type { LeadScoringService } from "../modules/leadradar/application/services/lead-scoring-service.js";
import type { LeadDeduplicationService } from "../modules/leadradar/application/services/lead-deduplication-service.js";
import type { LeadCRMService } from "../modules/leadradar/application/services/lead-crm-service.js";

declare module "fastify" {
  interface FastifyInstance {
    config: AppConfig;
    prisma: PrismaClient;
    redis: Redis;
    authenticate: import("fastify").preHandlerHookHandler;
    rateLimit: (opts?: unknown) => import("fastify").preHandlerHookHandler;

    leadradar?: {
      repositories: {
        lead: LeadRepository;
        source: LeadSourceRepository;
        keyword: LeadKeywordRepository;
        settings: LeadSettingsRepository;
      };
      services: {
        ingestion: LeadRadarIngestionService;
        sources: LeadSourceService;
        keywords: LeadKeywordService;
        match: LeadMatchService;
        scoring: LeadScoringService;
        dedupe: LeadDeduplicationService;
        crm: LeadCRMService;
      };
    };
  }

  interface FastifyRequest {
    rawBody?: Buffer;
    currentUser: {
      id: string;
      email: string;
      fullName: string;
      role: UserRole;
      companyId: string;
      company: {
        id: string;
        name: string;
        slug: string;
        plan: Plan;
        timezone: string;
      };
    } | null;
  }
}
