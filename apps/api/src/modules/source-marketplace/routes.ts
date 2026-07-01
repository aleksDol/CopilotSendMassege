import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { ensureInternalToken } from "../../lib/internal-auth.js";
import { requireTrialOrActive } from "../../lib/access.js";
import { isPlatformAdmin } from "../../lib/admin-access.js";
import { getCompanyScope, getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import {
  createEntryBodySchema,
  createTopicBodySchema,
  entryIdParamsSchema,
  listEntriesQuerySchema,
  listTopicsQuerySchema,
  marketplaceRecommendationsQuerySchema,
  startSubscribeBodySchema,
  subscribeJoinOutcomeBodySchema,
  subscribeRunIdParamsSchema,
  topicIdParamsSchema,
  updateEntryBodySchema,
  updateTopicBodySchema
} from "./schemas.js";
import { getMarketplaceRecommendations } from "./recommendations.js";
import { applySubscribeJoinOutcome, getSubscribeRun, startSubscribeRun } from "./subscribe-run.js";
import { resolveActiveLeadRadarTelegramAccount } from "../leadradar/api/account-guard.js";
import {
  createEntry,
  createTopic,
  deleteEntry,
  deleteTopic,
  listEntries,
  listTopics,
  updateEntry,
  updateTopic
} from "./service.js";

const sourceMarketplaceRoutes: FastifyPluginAsync = async (app) => {
  const requireAccess = requireTrialOrActive(app);

  const requirePlatformAdmin = async (request: FastifyRequest) => {
    const currentUser = getCurrentUserOrThrow(request);
    if (!isPlatformAdmin(app.config.env, currentUser.email)) {
      throw new AppError(403, "FORBIDDEN", "Admin access required");
    }
  };

  const adminPreHandler = [app.authenticate, requirePlatformAdmin];

  app.get(
    "/source-marketplace/recommendations",
    { preHandler: [app.authenticate, requireAccess] },
    async (request) => {
      const query = parseWithSchema(marketplaceRecommendationsQuerySchema, request.query);
      return getMarketplaceRecommendations(app.prisma, query.chatTopics ?? []);
    }
  );

  app.post("/source-marketplace/start", { preHandler: [app.authenticate, requireAccess] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(startSubscribeBodySchema, request.body);

    const active = await resolveActiveLeadRadarTelegramAccount(app.prisma, {
      companyId: scope.companyId,
      userId: scope.userId,
      channelAccountId: body.channelAccountId
    });

    if (!active) {
      throw new AppError(400, "TELEGRAM_PARSING_DISABLED", "Parsing is disabled for this Telegram account");
    }

    return startSubscribeRun(
      app.prisma,
      {
        userId: scope.userId,
        telegramAccountId: active.id,
        topicIds: body.topicIds
      },
      app.config.env
    );
  });

  app.get("/source-marketplace/runs/:id", { preHandler: [app.authenticate, requireAccess] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(subscribeRunIdParamsSchema, request.params);
    return getSubscribeRun(app.prisma, { runId: params.id, userId: scope.userId });
  });

  app.post("/internal/source-marketplace/join-outcome", async (request) => {
    ensureInternalToken(
      typeof request.headers["x-internal-token"] === "string" ? request.headers["x-internal-token"] : undefined,
      app.config.env.INTERNAL_API_TOKEN
    );

    const body = parseWithSchema(subscribeJoinOutcomeBodySchema, request.body);
    return applySubscribeJoinOutcome(app.prisma, app.redis, body);
  });

  app.get("/admin/source-marketplace/topics", { preHandler: adminPreHandler }, async (request) => {
    const query = parseWithSchema(listTopicsQuerySchema, request.query);
    return listTopics(app.prisma, query);
  });

  app.post("/admin/source-marketplace/topics", { preHandler: adminPreHandler }, async (request) => {
    const body = parseWithSchema(createTopicBodySchema, request.body);
    return createTopic(app.prisma, body);
  });

  app.patch("/admin/source-marketplace/topics/:id", { preHandler: adminPreHandler }, async (request) => {
    const params = parseWithSchema(topicIdParamsSchema, request.params);
    const body = parseWithSchema(updateTopicBodySchema, request.body);
    return updateTopic(app.prisma, params.id, body);
  });

  app.delete("/admin/source-marketplace/topics/:id", { preHandler: adminPreHandler }, async (request) => {
    const params = parseWithSchema(topicIdParamsSchema, request.params);
    return deleteTopic(app.prisma, params.id);
  });

  app.get("/admin/source-marketplace/entries", { preHandler: adminPreHandler }, async (request) => {
    const query = parseWithSchema(listEntriesQuerySchema, request.query);
    return listEntries(app.prisma, query);
  });

  app.post("/admin/source-marketplace/entries", { preHandler: adminPreHandler }, async (request) => {
    const body = parseWithSchema(createEntryBodySchema, request.body);
    return createEntry(app.prisma, body);
  });

  app.patch("/admin/source-marketplace/entries/:id", { preHandler: adminPreHandler }, async (request) => {
    const params = parseWithSchema(entryIdParamsSchema, request.params);
    const body = parseWithSchema(updateEntryBodySchema, request.body);
    return updateEntry(app.prisma, params.id, body);
  });

  app.delete("/admin/source-marketplace/entries/:id", { preHandler: adminPreHandler }, async (request) => {
    const params = parseWithSchema(entryIdParamsSchema, request.params);
    return deleteEntry(app.prisma, params.id);
  });
};

export default sourceMarketplaceRoutes;
