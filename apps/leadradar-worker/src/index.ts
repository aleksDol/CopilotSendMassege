import { createServer } from "node:http";
import { QueueEvents, Worker } from "bullmq";
import { Prisma, PrismaClient } from "@prisma/client";
import { TelegramWorkerAuthorProfileClient } from "./telegram-worker-author-profile-client.js";
import { AuthorProfileFetchLimiter } from "./author-profile-fetch-limiter.js";

// Keep the job contract stable and independent from API package internals.
// This avoids runtime failures when API sources are not shipped in production images.
const LEADRADAR_QUEUE_NAME = "leadradar-ingestion" as const;
const LEADRADAR_JOB_NAME = "process-message" as const;
const LEADRADAR_AUTHOR_PROFILE_CHECK_JOB_NAME = "author-profile-check" as const;

type LeadRadarSourceHints = {
  relatedChannelId?: string | null;
  relatedPostId?: string | null;
  sourceType?: string | null;
};

export type LeadRadarProcessMessageJob = {
  telegramAccountId: string;
  chatId: string;
  externalMessageId: string;
  sentAt?: string;
  sourceHints?: LeadRadarSourceHints;
};

export type LeadRadarAuthorProfileCheckJob = {
  userId: string;
  telegramAccountId: string;
  telegramUserId?: string | null;
  sourceChatId: string;
  sourceChatTitle?: string | null;
  sourceMessageId: string;
  sourceMessageDate?: string | null;
  sourceType?: string | null;
  username?: string | null;
  displayName?: string | null;
  contextPreview?: string | null;
  relatedPostId?: string | null;
};

const startedAt = Date.now();
const healthPort = Number(process.env.LEADRADAR_WORKER_PORT ?? 8092);
const redisUrl = process.env.REDIS_URL ?? "";
const concurrency = Number(process.env.LEADRADAR_WORKER_CONCURRENCY ?? 4);
const authorProfileCheckConcurrency = Number(process.env.LEADRADAR_AUTHOR_PROFILE_CHECK_CONCURRENCY ?? 2);
const authorProfileFetchTimeoutMs = Number(
  process.env.LEADRADAR_AUTHOR_PROFILE_FETCH_TIMEOUT_MS ?? process.env.TELEGRAM_WORKER_TIMEOUT_MS ?? 8000
);
const authorProfileFetchLimitPerMinute = Number(process.env.LEADRADAR_AUTHOR_PROFILE_FETCH_LIMIT_PER_MINUTE ?? 30);
const isAuthorProfileMatchingEnabled = (() => {
  const raw = String(process.env.ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED ?? "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
})();
const telegramWorkerUrl = (process.env.TELEGRAM_WORKER_URL ?? "").trim();
const internalApiToken = (process.env.INTERNAL_API_TOKEN ?? "").trim();

if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const toBullMqConnection = (urlStr: string) => {
  const url = new URL(urlStr);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.replace("/", "")) : 0
  };
};

const connection = toBullMqConnection(redisUrl);

const createConcurrencyGate = (limitRaw: number) => {
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 1;
  let active = 0;
  const waiters: Array<() => void> = [];

  const acquire = async () => {
    if (active < limit) {
      active += 1;
      return;
    }
    await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
  };

  const release = () => {
    active = Math.max(0, active - 1);
    const next = waiters.shift();
    if (next) next();
  };

  return async <T>(run: () => Promise<T>): Promise<T> => {
    await acquire();
    try {
      return await run();
    } finally {
      release();
    }
  };
};

const log = (level: "info" | "warn" | "error", message: string, extra: Record<string, unknown> = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "leadradar-worker",
      level,
      message,
      ...extra
    })
  );
};

const prisma = new PrismaClient();
const authorProfileFetchLimiter = new AuthorProfileFetchLimiter({
  limitPerMinute: authorProfileFetchLimitPerMinute
});
const authorProfileClient =
  telegramWorkerUrl && internalApiToken
    ? new TelegramWorkerAuthorProfileClient(telegramWorkerUrl, internalApiToken, authorProfileFetchTimeoutMs, log)
    : null;
if (!authorProfileClient) {
  log("warn", "Author-profile enrichment client disabled (missing TELEGRAM_WORKER_URL or INTERNAL_API_TOKEN)");
}

const loadLeadRadarIngestion = async () => {
  // Runtime dependency: compiled API module (built into the same monorepo image).
  // Path is relative to /app/apps/leadradar-worker/dist/index.js
  const composeUrl = new URL("../../api/dist/modules/leadradar/compose.js", import.meta.url);
  const mod = (await import(composeUrl.href)) as unknown as {
    createLeadRadarIngestionService: (params: { prisma: PrismaClient; logger?: { info: (msg: string) => void } }) => {
      processMessage: (input: any) => Promise<void>;
    };
    createLeadRadarAuthorProfileCheckService: (params: {
      prisma: PrismaClient;
      logger?: { info: (msg: string) => void; warn?: (msg: string, meta?: Record<string, unknown>) => void };
      profileFetcher?: {
        fetchProfile: (input: {
          telegramAccountId: string;
          telegramUserId?: string | null;
          username?: string | null;
        }) => Promise<{
          telegramUserId?: string | null;
          username?: string | null;
          displayName?: string | null;
          bio?: string | null;
          linkedChannelId?: string | null;
          linkedChannelUsername?: string | null;
          linkedChannelTitle?: string | null;
          linkedChannelDescription?: string | null;
          rawProfileJson?: unknown | null;
        } | null>;
      };
    }) => {
      process: (input: LeadRadarAuthorProfileCheckJob) => Promise<{
        matched: boolean;
        score: number;
        matchedKeywordsCount: number;
        usedCache: boolean;
        skippedReason?: string;
      }>;
    };
  };

  const logger = {
    info: (msg: string) => log("info", msg),
    warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta)
  };

  return {
    ingestion: mod.createLeadRadarIngestionService({ prisma, logger }),
    createAuthorProfileCheck: (profileFetcher?: {
      fetchProfile: (input: {
        telegramAccountId: string;
        telegramUserId?: string | null;
        username?: string | null;
      }) => Promise<
        | {
            telegramUserId?: string | null;
            username?: string | null;
            displayName?: string | null;
            bio?: string | null;
            linkedChannelId?: string | null;
            linkedChannelUsername?: string | null;
            linkedChannelTitle?: string | null;
            linkedChannelDescription?: string | null;
            rawProfileJson?: unknown | null;
          }
        | null
      >;
    }) =>
      mod.createLeadRadarAuthorProfileCheckService({
        prisma,
        logger,
        profileFetcher
      })
  };
};

const leadradarServices = await loadLeadRadarIngestion();
const runAuthorProfileJob = createConcurrencyGate(authorProfileCheckConcurrency);

const jobEvents = new QueueEvents(LEADRADAR_QUEUE_NAME, { connection });
jobEvents.on("failed", ({ jobId, failedReason }) => {
  log("error", "Queue job failed", { queueName: LEADRADAR_QUEUE_NAME, jobId, failedReason });
});

const isUniqueViolationDuplicateLead = (err: unknown): boolean => {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError)) return false;
  if (err.code !== "P2002") return false;
  // We treat any unique constraint violation as duplicate-safe for this worker,
  // because lead creation is keyed by (telegramAccountId, chatId, messageId).
  return true;
};

const worker = new Worker<LeadRadarProcessMessageJob | LeadRadarAuthorProfileCheckJob>(
  LEADRADAR_QUEUE_NAME,
  async (job) => {
    if (job.name === LEADRADAR_AUTHOR_PROFILE_CHECK_JOB_NAME) {
      if (!isAuthorProfileMatchingEnabled) {
        const payload = (job.data ?? {}) as Partial<LeadRadarAuthorProfileCheckJob>;
        log("info", "Author-profile-check skipped (feature disabled)", {
          event: "skipped_feature_disabled",
          jobId: job.id,
          telegramAccountId: payload.telegramAccountId ?? null,
          telegramUserId: payload.telegramUserId ?? null,
          username: payload.username ?? null,
          sourceChatId: payload.sourceChatId ?? null
        });
        return { status: "skipped", reason: "feature_disabled" };
      }
      return runAuthorProfileJob(async () => {
        const payload = (job.data ?? {}) as LeadRadarAuthorProfileCheckJob;
        if (!payload?.userId || !payload?.telegramAccountId || !payload?.sourceChatId || !payload?.sourceMessageId) {
          log("warn", "Invalid author-profile-check payload (missing fields)", { jobId: job.id, payload });
          return { status: "skipped", reason: "invalid_payload" };
        }

        const usernameNormalized =
          typeof payload.username === "string" ? payload.username.trim().replace(/^@+/u, "").toLowerCase() : null;

        // Track fetch behavior to emit cache/fetch events without changing API code.
        const fetchState: {
          called: boolean;
          rateLimited: boolean;
          fetched: boolean;
          fetchFailed: boolean;
        } = { called: false, rateLimited: false, fetched: false, fetchFailed: false };

        const profileFetcher = authorProfileClient
          ? {
              fetchProfile: async (input: {
                telegramAccountId: string;
                telegramUserId?: string | null;
                username?: string | null;
              }) => {
                fetchState.called = true;
                // Limit per telegramAccountId (per requirements).
                if (!authorProfileFetchLimiter.allow(input.telegramAccountId)) {
                  fetchState.rateLimited = true;
                  log("info", "Author-profile fetch rate limited (skipping fetch)", {
                    event: "rate_limited",
                    jobId: job.id,
                    telegramAccountId: input.telegramAccountId,
                    telegramUserId: input.telegramUserId ?? null,
                    username: input.username ?? null,
                    sourceChatId: payload.sourceChatId
                  });
                  return null;
                }

                const profile = await authorProfileClient.fetchProfile(input).catch(() => null);
                if (profile) {
                  fetchState.fetched = true;
                  log("info", "Author-profile fetched", {
                    event: "fetched",
                    jobId: job.id,
                    telegramAccountId: input.telegramAccountId,
                    telegramUserId: input.telegramUserId ?? null,
                    username: input.username ?? null,
                    sourceChatId: payload.sourceChatId
                  });
                } else {
                  fetchState.fetchFailed = true;
                  log("info", "Author-profile fetch failed (continuing without enrichment)", {
                    event: "fetch_failed",
                    jobId: job.id,
                    telegramAccountId: input.telegramAccountId,
                    telegramUserId: input.telegramUserId ?? null,
                    username: input.username ?? null,
                    sourceChatId: payload.sourceChatId
                  });
                }
                return profile;
              }
            }
          : undefined;

        log("info", "Author-profile-check started", {
          event: "author_profile_check_started",
          jobId: job.id,
          telegramAccountId: payload.telegramAccountId,
          telegramUserId: payload.telegramUserId ?? null,
          username: usernameNormalized,
          sourceChatId: payload.sourceChatId,
          sourceMessageId: payload.sourceMessageId
        });

        const authorProfileCheck = leadradarServices.createAuthorProfileCheck(profileFetcher);
        const result = await authorProfileCheck.process(payload);

        if (result.skippedReason === "missing_author_identity") {
          log("info", "Author-profile-check skipped: missing identity", {
            event: "skipped_no_identity",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId
          });
        } else if (result.skippedReason === "existing_author_profile_lead") {
          log("info", "Author-profile-check skipped: duplicate", {
            event: "duplicate_skipped",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId
          });
        }

        if (!fetchState.called && result.usedCache) {
          log("info", "Author-profile cache hit", {
            event: "cache_hit",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId
          });
        } else if (fetchState.called) {
          log("info", "Author-profile cache miss", {
            event: "cache_miss",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId
          });
        }

        if (result.matched) {
          log("info", "Author-profile matched", {
            event: "matched",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId,
            score: result.score,
            matchedKeywordsCount: result.matchedKeywordsCount
          });
        } else {
          log("info", "Author-profile no match", {
            event: "no_match",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId,
            score: result.score,
            matchedKeywordsCount: result.matchedKeywordsCount
          });
        }

        const createdLeadId = (result as any).createdLeadId as string | undefined;
        if (createdLeadId) {
          log("info", "Author-profile lead created", {
            event: "created",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId,
            score: result.score,
            matchedKeywordsCount: result.matchedKeywordsCount,
            leadId: createdLeadId
          });
        } else if (result.skippedReason === "duplicate_on_create") {
          log("info", "Author-profile lead create skipped (duplicate/conflict)", {
            event: "create_duplicate_or_conflict",
            jobId: job.id,
            telegramAccountId: payload.telegramAccountId,
            telegramUserId: payload.telegramUserId ?? null,
            username: usernameNormalized,
            sourceChatId: payload.sourceChatId,
            score: result.score,
            matchedKeywordsCount: result.matchedKeywordsCount
          });
        }

        log("info", "Author-profile-check processed", {
          jobId: job.id,
          telegramAccountId: payload.telegramAccountId,
          telegramUserId: payload.telegramUserId ?? null,
          sourceChatId: payload.sourceChatId,
          sourceMessageId: payload.sourceMessageId,
          matched: result.matched,
          score: result.score,
          matchedKeywordsCount: result.matchedKeywordsCount,
          usedCache: result.usedCache,
          skippedReason: result.skippedReason ?? null
        });
        return { status: "completed", ...result };
      });
    }

    if (job.name !== LEADRADAR_JOB_NAME) {
      log("warn", "Unknown job name (skipping)", { jobId: job.id, jobName: job.name });
      return { status: "skipped", reason: "unknown_job_name" };
    }

    const payload = (job.data ?? {}) as LeadRadarProcessMessageJob;
    const telegramAccountId = payload.telegramAccountId;
    const chatId = payload.chatId;
    const externalMessageId = payload.externalMessageId;

    if (!telegramAccountId || !chatId || !externalMessageId) {
      log("warn", "Invalid job payload (missing fields)", { jobId: job.id, payload });
      return { status: "skipped", reason: "invalid_payload" };
    }

    log("info", "LeadRadar job started", { jobId: job.id, telegramAccountId, chatId, externalMessageId });

    const telegramAccount = await prisma.telegramAccount.findUnique({
      where: { id: telegramAccountId },
      select: {
        id: true,
        channelAccountId: true,
        channelAccount: { select: { createdByUserId: true } }
      }
    });

    if (!telegramAccount) {
      log("warn", "Telegram account not found (skipping)", { jobId: job.id, telegramAccountId });
      return { status: "skipped", reason: "telegram_account_not_found" };
    }

    const userId = telegramAccount.channelAccount?.createdByUserId;
    if (typeof userId !== "string" || !userId.length) {
      log("warn", "Tenant scope userId missing (skipping)", { jobId: job.id, telegramAccountId });
      return { status: "skipped", reason: "user_id_missing" };
    }

    const conversation = await prisma.conversation.findUnique({
      where: {
        channelAccountId_externalConversationId: {
          channelAccountId: telegramAccount.channelAccountId,
          externalConversationId: chatId
        }
      },
      select: {
        id: true,
        title: true,
        conversationType: true
      }
    });

    if (!conversation) {
      log("warn", "Conversation not found (skipping)", { jobId: job.id, telegramAccountId, chatId });
      return { status: "skipped", reason: "conversation_not_found" };
    }

    const message = await prisma.message.findUnique({
      where: {
        conversationId_externalMessageId: {
          conversationId: conversation.id,
          externalMessageId
        }
      },
      select: {
        id: true,
        text: true,
        sentAt: true,
        relatedChannelId: true,
        relatedPostId: true,
        contextPreview: true,
        rawPayload: true,
        participant: {
          select: {
            externalParticipantId: true,
            username: true,
            fullName: true
          }
        }
      }
    });

    if (!message) {
      log("warn", "Message not found (skipping)", { jobId: job.id, telegramAccountId, chatId, externalMessageId });
      return { status: "skipped", reason: "message_not_found" };
    }

    // Observability only: job payload `sentAt` can legitimately differ from the DB row (TZ/format/updates).
    // The message row is already resolved by (conversationId, externalMessageId); do not skip processing.
    if (payload.sentAt) {
      const sentAtMs = Date.parse(payload.sentAt);
      if (!Number.isNaN(sentAtMs)) {
        const dbMs = message.sentAt?.getTime?.();
        if (typeof dbMs === "number") {
          const driftMs = Math.abs(dbMs - sentAtMs);
          if (driftMs > 5 * 60 * 1000) {
            log("warn", "LeadRadar payload sentAt differs from DB (continuing; DB row is authoritative)", {
              jobId: job.id,
              telegramAccountId,
              chatId,
              externalMessageId,
              payloadSentAt: payload.sentAt,
              dbSentAt: message.sentAt.toISOString(),
              driftMs
            });
          }
        }
      }
    }

    log("info", "LeadRadar loaded current message", {
      jobId: job.id,
      telegramAccountId,
      chatId,
      externalMessageId,
      dbMessagePk: message.id,
      textPreview: String(message.text ?? "").slice(0, 200)
    });

    const raw = message.rawPayload;
    const sourceType =
      raw && typeof raw === "object" && "chatType" in raw && typeof (raw as any).chatType === "string"
        ? ((raw as any).chatType as string)
        : null;

    try {
      await leadradarServices.ingestion.processMessage({
        userId,
        telegramAccountId,
        chatId,
        chatTitle: conversation.title ?? "",
        chatType: conversation.conversationType,
        messageId: externalMessageId,
        senderId: message.participant?.externalParticipantId ?? null,
        senderUsername: message.participant?.username ?? null,
        senderDisplayName: message.participant?.fullName ?? null,
        sourceType,
        relatedChannelId: message.relatedChannelId ?? payload.sourceHints?.relatedChannelId ?? null,
        relatedPostId: message.relatedPostId ?? payload.sourceHints?.relatedPostId ?? null,
        contextPreview: message.contextPreview ?? null,
        text: (message.text ?? "").trim(),
        date: message.sentAt
      });
    } catch (err) {
      if (isUniqueViolationDuplicateLead(err)) {
        log("info", "LeadRadar duplicate-safe (unique violation)", { jobId: job.id, telegramAccountId, chatId, externalMessageId });
        return { status: "duplicate_safe" };
      }
      log("error", "LeadRadar job failed", { jobId: job.id, error: err instanceof Error ? err.message : String(err) });
      throw err;
    }

    log("info", "LeadRadar job completed", { jobId: job.id, telegramAccountId, chatId, externalMessageId });
    return { status: "completed" };
  },
  { connection, concurrency, lockDuration: 120_000 }
);

worker.on("completed", (job) => {
  log("info", "Queue job completed", { queueName: worker.name, jobId: job.id });
});
worker.on("failed", (job, err) => {
  log("error", "Queue job failed (worker event)", { queueName: worker.name, jobId: job?.id, error: err.message });
});

const server = createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.url === "/metrics") {
    const uptimeSeconds = Math.floor((Date.now() - startedAt) / 1000);
    res.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(
      [
        "# HELP leadradar_worker_uptime_seconds LeadRadar worker uptime in seconds",
        "# TYPE leadradar_worker_uptime_seconds gauge",
        `leadradar_worker_uptime_seconds ${uptimeSeconds}`,
        "# HELP leadradar_worker_concurrency Configured LeadRadar worker concurrency",
        "# TYPE leadradar_worker_concurrency gauge",
        `leadradar_worker_concurrency ${concurrency}`,
        "# HELP leadradar_author_profile_check_concurrency Configured author-profile-check concurrency gate",
        "# TYPE leadradar_author_profile_check_concurrency gauge",
        `leadradar_author_profile_check_concurrency ${authorProfileCheckConcurrency}`
      ].join("\n")
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found" } }));
});

server.listen(healthPort, "0.0.0.0", () => {
  log("info", "LeadRadar worker started", { healthPort, concurrency });
});

const shutdown = async () => {
  log("info", "Shutting down leadradar-worker");
  await Promise.allSettled([worker.close(), jobEvents.close(), prisma.$disconnect()]);
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("uncaughtException", (error) => {
  log("error", "Unhandled exception in leadradar-worker", { error: error.message });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection in leadradar-worker", { reason: String(reason) });
});
