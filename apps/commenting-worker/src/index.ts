import { createServer } from "node:http";
import { CommentCandidateStatus, CommentPublishSource, MessageType, PrismaClient } from "@prisma/client";
import { Queue, QueueEvents, Worker } from "bullmq";
import { generateCommentWithHook } from "./generate-comment-with-hook.js";

type CommentingGenerationJob = {
  telegramAccountId: string;
  channelId: string;
  postId: string;
};

type CommentingAutoPublishJob = {
  candidateId: string;
};

const COMMENTING_QUEUE_NAME = "commenting-generation" as const;
const COMMENTING_JOB_NAME = "generate-comment" as const;
const COMMENTING_AUTO_PUBLISH_JOB_NAME = "auto-publish" as const;

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
const internalToken = process.env.INTERNAL_API_TOKEN;
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://api:4000";

// Safety limits (hidden guardrails)
const MAX_COMMENTS_PER_DAY = 12;
const MAX_COMMENTS_PER_HOUR = 2;
const MAX_PER_CHANNEL_PER_DAY = 1;
const AUTO_PUBLISH_DELAY_MIN_SECONDS = 120;
const AUTO_PUBLISH_DELAY_MAX_SECONDS = 600;
const GLOBAL_COOLDOWN_MIN_SECONDS = 60;
const GLOBAL_COOLDOWN_MAX_SECONDS = 120;
const PER_CHANNEL_COOLDOWN_MIN_HOURS = 2;
const PER_CHANNEL_COOLDOWN_MAX_HOURS = 4;
const MAX_CONSECUTIVE_AUTO_ERRORS = 3;
const AUTO_PAUSE_HOURS_ON_ERRORS = 6;

if (!redisUrl) {
  throw new Error("REDIS_URL is required");
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required");
}

const randomInt = (min: number, max: number) => {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
};

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

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

const queue = new Queue(COMMENTING_QUEUE_NAME, { connection });

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

const worker = new Worker<CommentingGenerationJob | CommentingAutoPublishJob>(
  COMMENTING_QUEUE_NAME,
  async (job) => {
    if (job.name !== COMMENTING_JOB_NAME && job.name !== COMMENTING_AUTO_PUBLISH_JOB_NAME) {
      log("warn", "Unknown job name (skipping)", { jobId: job.id, jobName: job.name });
      return { status: "skipped", reason: "unknown_job_name" };
    }

    if (job.name === COMMENTING_AUTO_PUBLISH_JOB_NAME) {
      const payload = job.data ?? ({} as CommentingAutoPublishJob);
      const candidateId = (payload as CommentingAutoPublishJob).candidateId;
      if (!candidateId) {
        log("warn", "Invalid auto-publish payload (missing candidateId)", { jobId: job.id, payload });
        return { status: "skipped", reason: "invalid_payload" };
      }

      const candidate = await prisma.commentCandidate.findUnique({
        where: { id: candidateId },
        select: {
          id: true,
          userId: true,
          telegramAccountId: true,
          channelId: true,
          postId: true,
          aiComment: true,
          status: true,
          publishedAt: true,
          publishedBy: true
        }
      });

      if (!candidate) {
        return { status: "skipped", reason: "candidate_not_found" };
      }

      if (candidate.status === CommentCandidateStatus.published || candidate.publishedAt) {
        return { status: "skipped", reason: "already_published" };
      }

      const state = await prisma.commentingUserState.upsert({
        where: { userId: candidate.userId },
        update: {},
        create: { userId: candidate.userId, lastSeenAt: new Date(0) },
        select: {
          autoCommentingEnabled: true,
          autoCommentingPausedUntil: true,
          autoCommentingConsecutiveErrors: true
        }
      });

      if (!state.autoCommentingEnabled) {
        return { status: "skipped", reason: "auto_mode_disabled" };
      }
      if (state.autoCommentingPausedUntil && state.autoCommentingPausedUntil.getTime() > Date.now()) {
        return { status: "skipped", reason: "auto_mode_paused" };
      }

      const text = candidate.aiComment?.trim();
      if (!text) {
        return { status: "skipped", reason: "missing_ai_comment" };
      }

      // Guardrails: counts + cooldowns
      const now = new Date();
      const sinceDay = startOfUtcDay(now);
      const sinceHour = new Date(now.getTime() - 60 * 60 * 1000);

      const [dayCount, hourCount, channelDayCount, lastAnyAuto, lastChannelAuto] = await Promise.all([
        prisma.commentCandidate.count({
          where: {
            userId: candidate.userId,
            publishedBy: CommentPublishSource.auto,
            publishedAt: { gte: sinceDay }
          }
        }),
        prisma.commentCandidate.count({
          where: {
            userId: candidate.userId,
            publishedBy: CommentPublishSource.auto,
            publishedAt: { gte: sinceHour }
          }
        }),
        prisma.commentCandidate.count({
          where: {
            userId: candidate.userId,
            channelId: candidate.channelId,
            publishedBy: CommentPublishSource.auto,
            publishedAt: { gte: sinceDay }
          }
        }),
        prisma.commentCandidate.findFirst({
          where: { userId: candidate.userId, publishedBy: CommentPublishSource.auto, publishedAt: { not: null } },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          select: { publishedAt: true }
        }),
        prisma.commentCandidate.findFirst({
          where: {
            userId: candidate.userId,
            channelId: candidate.channelId,
            publishedBy: CommentPublishSource.auto,
            publishedAt: { not: null }
          },
          orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
          select: { publishedAt: true }
        })
      ]);

      if (dayCount >= MAX_COMMENTS_PER_DAY) {
        log("warn", "auto-publish skipped (daily limit)", { candidateId, userId: candidate.userId, dayCount });
        return { status: "skipped", reason: "daily_limit" };
      }
      if (hourCount >= MAX_COMMENTS_PER_HOUR) {
        log("warn", "auto-publish skipped (hourly limit)", { candidateId, userId: candidate.userId, hourCount });
        return { status: "skipped", reason: "hourly_limit" };
      }
      if (channelDayCount >= MAX_PER_CHANNEL_PER_DAY) {
        log("warn", "auto-publish skipped (per-channel daily limit)", {
          candidateId,
          userId: candidate.userId,
          channelId: candidate.channelId,
          channelDayCount
        });
        return { status: "skipped", reason: "per_channel_daily_limit" };
      }

      const globalCooldownSeconds = randomInt(GLOBAL_COOLDOWN_MIN_SECONDS, GLOBAL_COOLDOWN_MAX_SECONDS);
      if (lastAnyAuto?.publishedAt) {
        const elapsed = (now.getTime() - lastAnyAuto.publishedAt.getTime()) / 1000;
        if (elapsed < globalCooldownSeconds) {
          log("warn", "auto-publish skipped (global cooldown)", {
            candidateId,
            userId: candidate.userId,
            elapsedSeconds: elapsed,
            requiredSeconds: globalCooldownSeconds
          });
          return { status: "skipped", reason: "global_cooldown" };
        }
      }

      const channelCooldownHours = randomInt(PER_CHANNEL_COOLDOWN_MIN_HOURS, PER_CHANNEL_COOLDOWN_MAX_HOURS);
      const channelCooldownMs = channelCooldownHours * 3600 * 1000;
      if (lastChannelAuto?.publishedAt) {
        const elapsedMs = now.getTime() - lastChannelAuto.publishedAt.getTime();
        if (elapsedMs < channelCooldownMs) {
          log("warn", "auto-publish skipped (per-channel cooldown)", {
            candidateId,
            userId: candidate.userId,
            channelId: candidate.channelId,
            elapsedMs,
            requiredMs: channelCooldownMs
          });
          return { status: "skipped", reason: "per_channel_cooldown" };
        }
      }

      if (!internalToken) {
        throw new Error("INTERNAL_API_TOKEN is required for auto-publish jobs");
      }

      log("info", "auto-publish started", {
        candidateId,
        userId: candidate.userId,
        channelId: candidate.channelId,
        postId: candidate.postId
      });

      const response = await fetch(`${apiInternalUrl}/internal/commenting/candidates/${encodeURIComponent(candidateId)}/publish-auto`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": internalToken
        },
        body: JSON.stringify({})
      });

      if (!response.ok) {
        const bodyText = await response.text().catch(() => "");
        const errMessage = `auto-publish failed: ${response.status} ${bodyText}`.slice(0, 2000);

        await prisma.$transaction([
          prisma.commentCandidate.update({
            where: { id: candidateId },
            data: {
              autoPublishAttempts: { increment: 1 },
              autoPublishLastErrorAt: new Date(),
              autoPublishLastError: errMessage
            }
          }),
          prisma.commentingUserState.upsert({
            where: { userId: candidate.userId },
            update: {
              autoCommentingConsecutiveErrors: { increment: 1 }
            },
            create: {
              userId: candidate.userId,
              lastSeenAt: new Date(0),
              autoCommentingEnabled: true,
              autoCommentingEnabledAt: new Date(),
              autoCommentingConsecutiveErrors: 1
            }
          })
        ]);

        const nextState = await prisma.commentingUserState.findUnique({
          where: { userId: candidate.userId },
          select: { autoCommentingConsecutiveErrors: true }
        });

        const consecutive = nextState?.autoCommentingConsecutiveErrors ?? state.autoCommentingConsecutiveErrors + 1;
        if (consecutive >= MAX_CONSECUTIVE_AUTO_ERRORS) {
          const pausedUntil = new Date(Date.now() + AUTO_PAUSE_HOURS_ON_ERRORS * 3600 * 1000);
          await prisma.commentingUserState.update({
            where: { userId: candidate.userId },
            data: {
              autoCommentingPausedUntil: pausedUntil,
              autoCommentingPauseReason: "3 consecutive auto-publish errors"
            }
          });
          log("error", "auto-publish paused due to consecutive errors", {
            userId: candidate.userId,
            pausedUntil: pausedUntil.toISOString()
          });
        }

        log("error", "auto-publish failed", {
          candidateId,
          userId: candidate.userId,
          channelId: candidate.channelId,
          postId: candidate.postId,
          error: errMessage
        });

        return { status: "failed" };
      }

      await prisma.commentingUserState.upsert({
        where: { userId: candidate.userId },
        update: {
          autoCommentingConsecutiveErrors: 0,
          autoCommentingPausedUntil: null,
          autoCommentingPauseReason: null,
          lastAutoPublishedAt: new Date()
        },
        create: {
          userId: candidate.userId,
          lastSeenAt: new Date(0),
          autoCommentingEnabled: true,
          autoCommentingEnabledAt: new Date(),
          autoCommentingConsecutiveErrors: 0,
          lastAutoPublishedAt: new Date()
        }
      });

      log("info", "auto-publish succeeded", { candidateId, userId: candidate.userId });
      return { status: "completed", candidateId };
    }

    const payload = job.data ?? ({} as CommentingGenerationJob);
    const telegramAccountId = (payload as CommentingGenerationJob).telegramAccountId;
    const channelId = (payload as CommentingGenerationJob).channelId;
    const postId = (payload as CommentingGenerationJob).postId;

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

    // Auto-publish scheduling (delayed + guardrails handled in auto-publish job)
    try {
      const state = await prisma.commentingUserState.upsert({
        where: { userId },
        update: {},
        create: { userId, lastSeenAt: new Date(0) },
        select: { autoCommentingEnabled: true, autoCommentingPausedUntil: true }
      });

      if (state.autoCommentingEnabled && !(state.autoCommentingPausedUntil && state.autoCommentingPausedUntil.getTime() > Date.now())) {
        const delaySeconds = randomInt(AUTO_PUBLISH_DELAY_MIN_SECONDS, AUTO_PUBLISH_DELAY_MAX_SECONDS);
        await queue.add(
          COMMENTING_AUTO_PUBLISH_JOB_NAME,
          { candidateId } satisfies CommentingAutoPublishJob,
          {
            jobId: `auto-${candidateId}`,
            delay: delaySeconds * 1000,
            attempts: 1,
            removeOnComplete: { age: 24 * 3600, count: 10_000 },
            removeOnFail: false
          }
        );
        log("info", "auto-publish scheduled", { candidateId, delaySeconds });
      }
    } catch (error) {
      log("error", "auto-publish scheduling failed", {
        candidateId,
        error: error instanceof Error ? error.message : String(error)
      });
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
  await Promise.allSettled([worker.close(), jobEvents.close(), queue.close(), prisma.$disconnect()]);
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
