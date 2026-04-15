import { createServer } from "node:http";
import { CommentCandidateStatus, MessageType, PrismaClient } from "@prisma/client";
import { QueueEvents, Worker } from "bullmq";
import { generateCommentWithHook } from "./generate-comment-with-hook.js";

type CommentingGenerationJob = {
  telegramAccountId: string;
  channelId: string;
  postId: string;
};

const COMMENTING_QUEUE_NAME = "commenting-generation" as const;
const COMMENTING_JOB_NAME = "generate-comment" as const;

const startedAt = Date.now();
const healthPort = Number(process.env.COMMENTING_WORKER_PORT ?? 8093);
const redisUrl = process.env.REDIS_URL ?? "";
const concurrency = Number(process.env.COMMENTING_WORKER_CONCURRENCY ?? 4);
const minPostLength = Number(process.env.COMMENTING_MIN_POST_LENGTH ?? 20);
const openAiApiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL_REPLY ?? "gpt-4o-mini";
const openAiBaseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
const aiTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 12000);
const defaultToneMode = process.env.COMMENTING_TONE_MODE ?? "neutral";

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
      service: "commenting-worker",
      level,
      message,
      ...extra
    })
  );
};

const prisma = new PrismaClient();

const LOW_SIGNAL_PATTERNS: RegExp[] = [
  /^\s*$/,
  /^(interesting|nice|cool|wow|good post|thanks)\b[!. ]*$/i,
  /^(.)\1{5,}$/ // repeated same char, e.g. ".....", "!!!!!"
];

const countAlphaNumeric = (text: string) => (text.match(/[\p{L}\p{N}]/gu) ?? []).length;

const isLowSignalPost = (text: string): boolean => {
  const normalized = text.trim();
  if (!normalized.length) return true;
  if (normalized.length < minPostLength) return true;
  if (LOW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized))) return true;
  if (/^https?:\/\/\S+$/i.test(normalized)) return true;
  if (countAlphaNumeric(normalized) < 12) return true;
  return false;
};

const jobEvents = new QueueEvents(COMMENTING_QUEUE_NAME, { connection });
jobEvents.on("failed", ({ jobId, failedReason }) => {
  log("error", "Queue job failed", { queueName: COMMENTING_QUEUE_NAME, jobId, failedReason });
});

const worker = new Worker<CommentingGenerationJob>(
  COMMENTING_QUEUE_NAME,
  async (job) => {
    if (job.name !== COMMENTING_JOB_NAME) {
      log("warn", "Unknown job name (skipping)", { jobId: job.id, jobName: job.name });
      return { status: "skipped", reason: "unknown_job_name" };
    }

    const payload = job.data ?? ({} as CommentingGenerationJob);
    const telegramAccountId = payload.telegramAccountId;
    const channelId = payload.channelId;
    const postId = payload.postId;

    if (!telegramAccountId || !channelId || !postId) {
      log("warn", "Invalid job payload (missing fields)", { jobId: job.id, payload });
      return { status: "skipped", reason: "invalid_payload" };
    }

    log("info", "candidate generation started", { jobId: job.id, telegramAccountId, channelId, postId });

    const telegramAccount = await prisma.telegramAccount.findUnique({
      where: { id: telegramAccountId },
      select: {
        id: true,
        channelAccountId: true,
        channelAccount: { select: { createdByUserId: true } }
      }
    });

    if (!telegramAccount) {
      return { status: "skipped", reason: "telegram_account_not_found" };
    }

    const userId = telegramAccount.channelAccount.createdByUserId;
    if (!userId) {
      return { status: "skipped", reason: "user_id_missing" };
    }

    const message = await prisma.message.findFirst({
      where: {
        externalMessageId: postId,
        conversation: {
          channelAccountId: telegramAccount.channelAccountId,
          externalConversationId: channelId,
          conversationType: "CHANNEL"
        }
      },
      select: {
        id: true,
        text: true,
        messageType: true
      },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }]
    });

    if (!message) {
      return { status: "skipped", reason: "post_message_not_found" };
    }

    const postText = (message.text ?? "").trim();
    if (!postText.length) {
      return { status: "skipped", reason: "message_empty" };
    }
    // Allow captioned media posts: API marks messages with attachments as MEDIA,
    // but they can still have meaningful text (caption) that we want to comment on.
    if (message.messageType !== MessageType.TEXT && message.messageType !== MessageType.MEDIA) {
      return { status: "skipped", reason: "message_unsupported_type" };
    }
    if (isLowSignalPost(postText)) {
      return { status: "skipped", reason: "message_low_signal" };
    }

    const existing = await prisma.commentCandidate.findUnique({
      where: {
        telegramAccountId_channelId_postId: {
          telegramAccountId,
          channelId,
          postId
        }
      },
      select: {
        id: true,
        status: true
      }
    });

    if (existing?.status === CommentCandidateStatus.published) {
      return { status: "skipped", reason: "already_published" };
    }

    if (!openAiApiKey) {
      log("error", "comment generation failed", {
        jobId: job.id,
        telegramAccountId,
        channelId,
        postId,
        reason: "OPENAI_API_KEY is missing"
      });
      return { status: "skipped", reason: "openai_api_key_missing" };
    }

    log("info", "comment generation started", {
      jobId: job.id,
      telegramAccountId,
      channelId,
      postId
    });

    let generated: Awaited<ReturnType<typeof generateCommentWithHook>>;
    try {
      generated = await generateCommentWithHook(
        {
          postText,
          toneMode:
            defaultToneMode === "expert" || defaultToneMode === "curiosity" || defaultToneMode === "neutral"
              ? defaultToneMode
              : "neutral"
        },
        {
          apiKey: openAiApiKey,
          model: openAiModel,
          baseUrl: openAiBaseUrl,
          timeoutMs: aiTimeoutMs
        }
      );
    } catch (error) {
      log("error", "comment generation failed", {
        jobId: job.id,
        telegramAccountId,
        channelId,
        postId,
        error: error instanceof Error ? error.message : String(error)
      });
      return { status: "generation_failed" };
    }

    if (!generated.comment.length) {
      return { status: "skipped", reason: "empty_generation" };
    }

    let candidateId: string;
    if (!existing) {
      const created = await prisma.commentCandidate.create({
        data: {
          userId,
          telegramAccountId,
          channelId,
          postId,
          postText,
          aiComment: generated.comment,
          status: CommentCandidateStatus.new
        },
        select: { id: true }
      });
      candidateId = created.id;
    } else {
      const updated = await prisma.commentCandidate.update({
        where: { id: existing.id },
        data: {
          postText,
          aiComment: generated.comment
        },
        select: { id: true }
      });
      candidateId = updated.id;
    }

    log("info", "comment generation succeeded", {
      jobId: job.id,
      candidateId,
      telegramAccountId,
      channelId,
      postId,
      model: generated.model,
      hookType: generated.hookType,
      confidence: generated.confidence,
      reason: generated.reason,
      attemptsUsed: generated.attemptsUsed,
      toneMode:
        defaultToneMode === "expert" || defaultToneMode === "curiosity" || defaultToneMode === "neutral"
          ? defaultToneMode
          : "neutral"
    });

    return { status: "completed", candidateId };
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
        "# HELP commenting_worker_uptime_seconds Commenting worker uptime in seconds",
        "# TYPE commenting_worker_uptime_seconds gauge",
        `commenting_worker_uptime_seconds ${uptimeSeconds}`,
        "# HELP commenting_worker_concurrency Configured commenting worker concurrency",
        "# TYPE commenting_worker_concurrency gauge",
        `commenting_worker_concurrency ${concurrency}`
      ].join("\n")
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found" } }));
});

server.listen(healthPort, "0.0.0.0", () => {
  log("info", "commenting-worker started", { healthPort, concurrency, minPostLength });
});

const shutdown = async () => {
  log("info", "Shutting down commenting-worker");
  await Promise.allSettled([worker.close(), jobEvents.close(), prisma.$disconnect()]);
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("uncaughtException", (error) => {
  log("error", "Unhandled exception in commenting-worker", { error: error.message });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection in commenting-worker", { reason: String(reason) });
});
