import type { FastifyPluginAsync } from "fastify";
import { ChannelAccountStatus, ChannelType, TelegramLoginStatus } from "@prisma/client";
import { AppError } from "../../../lib/errors.js";
import { getCompanyScope } from "../../../lib/request-context.js";
import { TelegramWorkerClient } from "../../../lib/telegram-worker-client.js";
import { parseWithSchema } from "../../../lib/validation.js";
import {
  createSourceBodySchema,
  createSourceByLinkBodySchema,
  createKeywordBodySchema,
  createNegativeKeywordBodySchema,
  listLeadsQuerySchema,
  listKeywordsQuerySchema,
  listSourcesQuerySchema,
  sourceIdParamsSchema,
  updateLeadNotesBodySchema,
  updateLeadStatusBodySchema,
  updateKeywordBodySchema,
  updateNegativeKeywordBodySchema,
  updateSettingsBodySchema,
  updateSourceBodySchema,
  testIngestionBodySchema
} from "./schemas.js";

/**
 * LeadRadar API controller (skeleton).
 *
 * IMPORTANT:
 * - No Telegram integration here.
 * - No ingestion side-effects.
 * - Endpoints will be added in later steps.
 */
const leadradarController: FastifyPluginAsync = async (app) => {
  app.get("/api/leadradar", async () => {
    return {
      ok: true,
      module: "leadradar",
      status: "todo"
    };
  });

  const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
  const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

  const requireActiveTelegramAccountId = async (params: { companyId: string; userId: string }) => {
    const active = await app.prisma.telegramAccount.findFirst({
      where: {
        loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
        channelAccount: {
          companyId: params.companyId,
          channelType: ChannelType.TELEGRAM,
          createdByUserId: params.userId,
          status: { not: ChannelAccountStatus.DISCONNECTED }
        }
      },
      orderBy: { updatedAt: "desc" },
      select: { id: true }
    });

    if (!active) {
      throw new AppError(400, "TELEGRAM_NOT_CONNECTED", "Telegram account not connected");
    }

    return active.id;
  };

  app.get("/api/leadradar/sources", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listSourcesQuerySchema, request.query);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.source;

    const items = await repo.listSources({
      user_id: scope.userId,
      telegram_account_id
    });

    const search = query.search?.trim().toLowerCase() ?? null;
    const filtered = items.filter((item) => {
      if (typeof query.is_active === "boolean" && item.is_active !== query.is_active) {
        return false;
      }
      if (search) {
        const title = (item.chat_title ?? "").toLowerCase();
        if (!title.includes(search)) return false;
      }
      return true;
    });

    return {
      items: filtered,
      total: filtered.length
    };
  });

  app.post("/api/leadradar/sources", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(createSourceBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.source;

    const createdOrExisting = await repo.addSource({
      user_id: scope.userId,
      telegram_account_id,
      telegram_chat_id: body.telegramChatId,
      chat_title: body.chatTitle ?? null,
      chat_type: body.chatType ?? null,
      is_active: true
    });

    return createdOrExisting;
  });

  app.post("/api/leadradar/sources/by-link", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(createSourceByLinkBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const telegram = await app.prisma.telegramAccount.findUnique({
      where: { id: telegram_account_id },
      select: { channelAccountId: true }
    });
    if (!telegram) {
      throw new AppError(400, "TELEGRAM_NOT_CONNECTED", "Telegram account not connected");
    }

    const worker = new TelegramWorkerClient(
      app.config.env.TELEGRAM_WORKER_URL,
      app.config.env.INTERNAL_API_TOKEN,
      app.config.env.TELEGRAM_WORKER_TIMEOUT_MS
    );

    const resolved = await worker.resolveChat({
      companyId: scope.companyId,
      channelAccountId: telegram.channelAccountId,
      link: body.link
    });

    const repo = request.server.leadradar.repositories.source;
    const createdOrExisting = await repo.addSource({
      user_id: scope.userId,
      telegram_account_id,
      telegram_chat_id: resolved.telegramChatId,
      chat_title: resolved.chatTitle ?? null,
      chat_type: resolved.chatType ?? null,
      is_active: true
    });

    return createdOrExisting;
  });

  app.patch("/api/leadradar/sources/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);
    const body = parseWithSchema(updateSourceBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.source;

    const updated = await repo.updateSource({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id,
      patch: {
        is_active: body.isActive
      }
    });

    return updated;
  });

  app.delete("/api/leadradar/sources/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    app.log.info(`[LeadRadar] DELETE source id=${params.id} userId=${scope.userId} tgAccountId=${telegram_account_id}`);
    const repo = request.server.leadradar.repositories.source;

    await repo.removeSource({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id
    });

    return { ok: true };
  });

  app.get("/api/leadradar/keywords", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listKeywordsQuerySchema, request.query);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.keyword;

    const items = await repo.listKeywords({
      user_id: scope.userId,
      telegram_account_id
    });

    const filtered = items.filter((item) => {
      if (typeof query.is_active === "boolean" && item.is_active !== query.is_active) return false;
      if (query.category && item.category !== query.category) return false;
      return true;
    });

    return { items: filtered, total: filtered.length };
  });

  app.post("/api/leadradar/keywords", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(createKeywordBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.keyword;

    const created = await repo.addKeyword({
      user_id: scope.userId,
      telegram_account_id,
      keyword: body.keyword,
      match_type: body.matchType,
      category: body.category,
      priority: body.priority ?? 0,
      is_active: true
    });

    return created;
  });

  app.patch("/api/leadradar/keywords/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);
    const body = parseWithSchema(updateKeywordBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.keyword;

    const updated = await repo.updateKeyword({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id,
      patch: {
        ...(typeof body.keyword === "string" ? { keyword: body.keyword } : {}),
        ...(body.matchType ? { match_type: body.matchType } : {}),
        ...(body.category ? { category: body.category } : {}),
        ...(typeof body.priority === "number" ? { priority: body.priority } : {}),
        ...(typeof body.isActive === "boolean" ? { is_active: body.isActive } : {})
      }
    });

    return updated;
  });

  app.delete("/api/leadradar/keywords/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    app.log.info(`[LeadRadar] DELETE keyword id=${params.id} userId=${scope.userId} tgAccountId=${telegram_account_id}`);
    const repo = request.server.leadradar.repositories.keyword;

    await repo.removeKeyword({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id
    });

    return { ok: true };
  });

  app.get("/api/leadradar/negative-keywords", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.keyword;

    const items = await repo.listNegativeKeywords({
      user_id: scope.userId,
      telegram_account_id
    });

    return { items, total: items.length };
  });

  app.post("/api/leadradar/negative-keywords", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(createNegativeKeywordBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.keyword;

    const created = await repo.addNegativeKeyword({
      user_id: scope.userId,
      telegram_account_id,
      phrase: body.phrase,
      is_active: true
    });

    return created;
  });

  app.patch("/api/leadradar/negative-keywords/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);
    const body = parseWithSchema(updateNegativeKeywordBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.keyword;

    const updated = await repo.updateNegativeKeyword({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id,
      patch: {
        ...(typeof body.phrase === "string" ? { phrase: body.phrase } : {}),
        ...(typeof body.isActive === "boolean" ? { is_active: body.isActive } : {})
      }
    });

    return updated;
  });

  app.delete("/api/leadradar/negative-keywords/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    app.log.info(`[LeadRadar] DELETE negative-keyword id=${params.id} userId=${scope.userId} tgAccountId=${telegram_account_id}`);
    const repo = request.server.leadradar.repositories.keyword;

    await repo.removeNegativeKeyword({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id
    });

    return { ok: true };
  });

  app.get("/api/leadradar/settings", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.settings;

    const existing = await repo.getSettings({
      user_id: scope.userId,
      telegram_account_id
    });

    const settings = existing
      ? existing
      : await repo.createDefaultIfNotExists({
          user_id: scope.userId,
          telegram_account_id
        });

    return {
      isEnabled: settings.is_enabled,
      minScoreThreshold: settings.min_score_threshold,
      storeContextEnabled: settings.store_context_enabled,
      contextBeforeCount: settings.context_before_count,
      contextAfterCount: settings.context_after_count,
      dedupeWindowHours: settings.dedupe_window_hours
    };
  });

  app.patch("/api/leadradar/settings", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const body = parseWithSchema(updateSettingsBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.settings;

    await repo.createDefaultIfNotExists({
      user_id: scope.userId,
      telegram_account_id
    });

    const updated = await repo.updateSettings({
      user_id: scope.userId,
      telegram_account_id,
      patch: {
        ...(typeof body.isEnabled === "boolean" ? { is_enabled: body.isEnabled } : {}),
        ...(typeof body.minScoreThreshold === "number" ? { min_score_threshold: body.minScoreThreshold } : {}),
        ...(typeof body.storeContextEnabled === "boolean" ? { store_context_enabled: body.storeContextEnabled } : {}),
        ...(typeof body.contextBeforeCount === "number" ? { context_before_count: body.contextBeforeCount } : {}),
        ...(typeof body.contextAfterCount === "number" ? { context_after_count: body.contextAfterCount } : {}),
        ...(typeof body.dedupeWindowHours === "number" ? { dedupe_window_hours: body.dedupeWindowHours } : {})
      }
    });

    return {
      isEnabled: updated.is_enabled,
      minScoreThreshold: updated.min_score_threshold,
      storeContextEnabled: updated.store_context_enabled,
      contextBeforeCount: updated.context_before_count,
      contextAfterCount: updated.context_after_count,
      dedupeWindowHours: updated.dedupe_window_hours
    };
  });

  // TODO(remove later): dev-only endpoint to manually test LeadRadar ingestion pipeline.
  // This must NOT be wired to Telegram flow and must not introduce side-effects beyond DB writes.
  app.post("/api/leadradar/test-ingestion", { preHandler: [app.authenticate] }, async (request) => {
    if (app.config.env.NODE_ENV === "production") {
      // Hide test-only endpoint in production.
      throw new AppError(404, "NOT_FOUND", "Route not found");
    }

    const scope = getCompanyScope(request);
    const body = parseWithSchema(testIngestionBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);

    await request.server.leadradar.services.ingestion.processMessage({
      userId: scope.userId,
      telegramAccountId: telegram_account_id,
      chatId: body.chatId,
      chatTitle: body.chatTitle,
      chatType: "unknown",
      messageId: body.messageId,
      senderId: null,
      senderUsername: null,
      senderDisplayName: null,
      text: body.text,
      date: new Date()
    });

    return { ok: true };
  });

  const toLeadItem = (lead: {
    id: string;
    username: string | null;
    display_name: string | null;
    telegram_user_id: string | null;
    chat_id: string;
    chat_title: string | null;
    message_id: string;
    message_text: string | null;
    message_date: Date;
    matched_keywords_json: unknown;
    score: number;
    lead_type: string | null;
    status: string;
    notes: string | null;
    contacted_at: Date | null;
    created_at: Date;
    updated_at: Date;
  }) => ({
    id: lead.id,
    username: lead.username,
    displayName: lead.display_name,
    telegramUserId: lead.telegram_user_id,
    chatId: lead.chat_id,
    chatTitle: lead.chat_title,
    messageId: lead.message_id,
    messageText: lead.message_text,
    messageDate: lead.message_date.toISOString(),
    matchedKeywords: lead.matched_keywords_json,
    score: lead.score,
    leadType: lead.lead_type,
    status: lead.status,
    notes: lead.notes,
    contactedAt: lead.contacted_at ? lead.contacted_at.toISOString() : null,
    createdAt: lead.created_at.toISOString(),
    updatedAt: lead.updated_at.toISOString()
  });

  app.get("/api/leadradar/leads", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const query = parseWithSchema(listLeadsQuerySchema, request.query);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.lead;

    const result = await repo.findByFilters({
      user_id: scope.userId,
      telegram_account_id,
      status: query.status,
      chat_id: query.chatId,
      search: query.search,
      date_from: query.date_from,
      date_to: query.date_to,
      page: query.page,
      limit: query.limit,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder
    });

    return {
      items: result.items.map(toLeadItem),
      page: result.page,
      limit: result.limit,
      total: result.total
    };
  });

  app.get("/api/leadradar/leads/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.lead;

    const lead = await repo.findById({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id,
      include: { context: true, events: true }
    });

    if (!lead) {
      throw new AppError(404, "LEAD_NOT_FOUND", "Lead not found");
    }

    // Context/events are Prisma shapes; keep them compact.
    const context = lead.context
      ? {
          beforeMessages: (lead.context as { before_messages_json?: unknown[] | null }).before_messages_json ?? [],
          afterMessages: (lead.context as { after_messages_json?: unknown[] | null }).after_messages_json ?? []
        }
      : null;

    const events = Array.isArray(lead.events)
      ? lead.events.map((e) => {
          const row = e as {
            id?: string;
            eventType?: string;
            oldStatus?: string | null;
            newStatus?: string | null;
            comment?: string | null;
            createdBy?: string | null;
            createdAt?: Date | string | null;
          };
          const createdAt =
            row.createdAt instanceof Date
              ? row.createdAt.toISOString()
              : typeof row.createdAt === "string"
                ? row.createdAt
                : null;
          return {
            id: row.id ?? "",
            eventType: row.eventType ?? "event",
            oldStatus: row.oldStatus ?? null,
            newStatus: row.newStatus ?? null,
            comment: row.comment ?? null,
            createdBy: row.createdBy ?? null,
            createdAt
          };
        })
      : [];

    return {
      lead: toLeadItem(lead),
      context,
      events
    };
  });

  app.patch("/api/leadradar/leads/:id/status", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);
    const body = parseWithSchema(updateLeadStatusBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.lead;

    const updated = await repo.updateStatus({
      lead_id: params.id,
      user_id: scope.userId,
      telegram_account_id,
      status: body.status
    });

    return toLeadItem(updated);
  });

  app.patch("/api/leadradar/leads/:id/notes", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);
    const body = parseWithSchema(updateLeadNotesBodySchema, request.body);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    const repo = request.server.leadradar.repositories.lead;

    const updated = await repo.updateNotes({
      lead_id: params.id,
      user_id: scope.userId,
      telegram_account_id,
      notes: body.notes
    });

    return toLeadItem(updated);
  });

  app.delete("/api/leadradar/leads/:id", { preHandler: [app.authenticate] }, async (request) => {
    const scope = getCompanyScope(request);
    const params = parseWithSchema(sourceIdParamsSchema, request.params);

    if (!request.server.leadradar) {
      throw new AppError(503, "LEADRADAR_NOT_AVAILABLE", "LeadRadar module is not available");
    }

    const telegram_account_id = await requireActiveTelegramAccountId(scope);
    app.log.info(`[LeadRadar] DELETE lead id=${params.id} userId=${scope.userId} tgAccountId=${telegram_account_id}`);
    const repo = request.server.leadradar.repositories.lead;

    await repo.removeLead({
      id: params.id,
      user_id: scope.userId,
      telegram_account_id
    });

    return { ok: true };
  });
};

export default leadradarController;

