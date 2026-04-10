import { createServer } from "node:http";
import { QueueEvents, Worker } from "bullmq";
import { Prisma, PrismaClient } from "@prisma/client";

// Keep the job contract stable and independent from API package internals.
// This avoids runtime failures when API sources are not shipped in production images.
const LEADRADAR_QUEUE_NAME = "leadradar-ingestion" as const;
const LEADRADAR_JOB_NAME = "process-message" as const;

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

const startedAt = Date.now();
const healthPort = Number(process.env.LEADRADAR_WORKER_PORT ?? 8092);
const redisUrl = process.env.REDIS_URL ?? "";
const concurrency = Number(process.env.LEADRADAR_WORKER_CONCURRENCY ?? 4);

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

const loadLeadRadarIngestion = async () => {
  // Runtime dependency: compiled API module (built into the same monorepo image).
  // Path is relative to /app/apps/leadradar-worker/dist/index.js
  const composeUrl = new URL("../../api/dist/modules/leadradar/compose.js", import.meta.url);
  const mod = (await import(composeUrl.href)) as unknown as {
    createLeadRadarIngestionService: (params: { prisma: PrismaClient; logger?: { info: (msg: string) => void } }) => {
      processMessage: (input: any) => Promise<void>;
    };
  };

  return mod.createLeadRadarIngestionService({
    prisma,
    logger: {
      info: (msg: string) => log("info", msg)
    }
  });
};

const leadradarIngestion = await loadLeadRadarIngestion();

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

const worker = new Worker<LeadRadarProcessMessageJob>(
  LEADRADAR_QUEUE_NAME,
  async (job) => {
    if (job.name !== LEADRADAR_JOB_NAME) {
      log("warn", "Unknown job name (skipping)", { jobId: job.id, jobName: job.name });
      return { status: "skipped", reason: "unknown_job_name" };
    }

    const payload = job.data ?? ({} as LeadRadarProcessMessageJob);
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

    const raw = message.rawPayload;
    const sourceType =
      raw && typeof raw === "object" && "chatType" in raw && typeof (raw as any).chatType === "string"
        ? ((raw as any).chatType as string)
        : null;

    try {
      await leadradarIngestion.processMessage({
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
        `leadradar_worker_concurrency ${concurrency}`
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

