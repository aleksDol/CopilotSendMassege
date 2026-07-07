import { randomUUID } from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { AppError } from "../../lib/errors.js";
import { ensureInternalToken } from "../../lib/internal-auth.js";
import { requireTrialOrActive } from "../../lib/access.js";
import { isPlatformAdmin } from "../../lib/admin-access.js";
import { getCompanyScope, getCurrentUserOrThrow } from "../../lib/request-context.js";
import { parseWithSchema } from "../../lib/validation.js";
import { TelegramWorkerClient } from "../../lib/telegram-worker-client.js";
import {
  createEntryBodySchema,
  createTopicBodySchema,
  entryIdParamsSchema,
  listEntriesQuerySchema,
  listTopicsQuerySchema,
  marketplaceRecommendationsQuerySchema,
  resolveCatalogLinkBodySchema,
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
    const traceId = randomUUID();

    app.systemLog.info({
      module: "marketplace",
      event: "MarketplaceStart",
      traceId,
      userId: scope.userId,
      companyId: scope.companyId,
      metadata: {
        topicCount: body.topicIds.length,
        channelAccountId: body.channelAccountId
      }
    });

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
        companyId: scope.companyId,
        telegramAccountId: active.id,
        topicIds: body.topicIds,
        traceId
      },
      app.config.env,
      app.systemLog
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
    return applySubscribeJoinOutcome(app.prisma, app.redis, body, app.systemLog);
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

  app.post("/admin/source-marketplace/resolve-link", { preHandler: adminPreHandler }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(resolveCatalogLinkBodySchema, request.body);

    const active = await resolveActiveLeadRadarTelegramAccount(app.prisma, {
      companyId: scope.companyId,
      userId: scope.userId,
      channelAccountId: body.channelAccountId
    });

    if (!active) {
      throw new AppError(400, "TELEGRAM_PARSING_DISABLED", "Parsing is disabled for this Telegram account");
    }

    const telegram = await app.prisma.telegramAccount.findUnique({
      where: { id: active.id },
      select: { channelAccountId: true }
    });

    if (!telegram) {
      throw new AppError(400, "TELEGRAM_NOT_CONNECTED", "Telegram account not connected");
    }

    const worker = new TelegramWorkerClient(
      app.config.env.TELEGRAM_WORKER_URL,
      app.config.env.INTERNAL_API_TOKEN,
      app.config.env.TELEGRAM_WORKER_TIMEOUT_MS,
      app.config.env.TELEGRAM_WORKER_RESOLVE_CHAT_TIMEOUT_MS
    );

    const resolved = await worker.resolveChat({
      companyId: scope.companyId,
      channelAccountId: telegram.channelAccountId,
      link: body.link
    });

    return {
      telegramChatId: resolved.telegramChatId,
      chatTitle: resolved.chatTitle,
      chatType: resolved.chatType,
      username: resolved.username ?? null
    };
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
