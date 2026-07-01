import { createServer } from "node:http";
import { Queue, QueueEvents, Worker, type JobsOptions } from "bullmq";

const startedAt = Date.now();
const healthPort = Number(process.env.AI_WORKER_PORT ?? 8090);
const redisUrl = process.env.REDIS_URL ?? "redis://localhost:6379";
const internalToken = process.env.INTERNAL_API_TOKEN;
const apiInternalUrl = process.env.API_INTERNAL_URL ?? "http://api:4000";
const aiConcurrency = Number(process.env.AI_WORKER_CONCURRENCY ?? 2);
const telegramConcurrency = Number(process.env.TELEGRAM_WORKER_CONCURRENCY ?? 2);
const subscribeConcurrency = Number(process.env.SOURCE_MARKETPLACE_SUBSCRIBE_CONCURRENCY ?? 1);
const telegramWorkerUrl = process.env.TELEGRAM_WORKER_URL ?? "http://telegram-worker:8080";
const telegramWorkerTimeoutMs = Number(process.env.TELEGRAM_WORKER_TIMEOUT_MS ?? 60_000);

const url = new URL(redisUrl);
const connection = {
  host: url.hostname,
  port: Number(url.port || 6379),
  username: url.username || undefined,
  password: url.password || undefined,
  db: url.pathname && url.pathname !== "/" ? Number(url.pathname.replace("/", "")) : 0
};

const log = (level: "info" | "error" | "warn", message: string, extra: Record<string, unknown> = {}) => {
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      service: "ai-worker",
      level,
      message,
      ...extra
    })
  );
};

const defaultJobOptions: JobsOptions = {
  attempts: 3,
  backoff: {
    type: "exponential",
    delay: 2000
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 1000
  },
  removeOnFail: false
};

const aiGenerationQueue = new Queue("ai-generation", { connection, defaultJobOptions });
const followUpScanQueue = new Queue("follow-up-scan", { connection, defaultJobOptions });
const telegramSyncQueue = new Queue("telegram-sync", { connection, defaultJobOptions });
const subscribeQueue = new Queue("telegram-subscribe", { connection, defaultJobOptions });
const deadLetterQueue = new Queue("dead-letter", { connection, defaultJobOptions });

const bindQueueEvents = (queueName: string) => {
  const events = new QueueEvents(queueName, { connection });

  events.on("failed", async ({ jobId, failedReason }) => {
    log("error", "Queue job failed", { queueName, jobId, failedReason });
    await deadLetterQueue.add(`${queueName}-failed`, { queueName, jobId, failedReason });
  });

  return events;
};

const aiEvents = bindQueueEvents("ai-generation");
const followUpEvents = bindQueueEvents("follow-up-scan");
const telegramEvents = bindQueueEvents("telegram-sync");
const subscribeEvents = bindQueueEvents("telegram-subscribe");

const aiWorker = new Worker(
  "ai-generation",
  async (job) => {
    log("info", "Processing ai-generation job", { jobId: job.id });
    return { status: "skipped", reason: "ai-generation handled in API request path for now" };
  },
  {
    connection,
    concurrency: aiConcurrency,
    lockDuration: Number(process.env.AI_REQUEST_TIMEOUT_MS ?? 12000)
  }
);

const followUpWorker = new Worker(
  "follow-up-scan",
  async (job) => {
    log("info", "Processing follow-up-scan job", { jobId: job.id, payload: job.data });

    if (!internalToken) {
      throw new Error("INTERNAL_API_TOKEN is required for follow-up-scan jobs");
    }

    const response = await fetch(`${apiInternalUrl}/internal/follow-up/run`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-token": internalToken
      },
      body: JSON.stringify(job.data ?? {})
    });

    if (!response.ok) {
      throw new Error(`follow-up-scan failed: ${response.status} ${await response.text()}`);
    }

    return response.json();
  },
  {
    connection,
    concurrency: aiConcurrency,
    lockDuration: 60_000
  }
);

const telegramSyncWorker = new Worker(
  "telegram-sync",
  async (job) => {
    log("info", "Processing telegram-sync job", { jobId: job.id });
    return { status: "queued", payload: job.data };
  },
  {
    connection,
    concurrency: telegramConcurrency,
    lockDuration: 120_000
  }
);

type JoinCatalogEntryJob = {
  runId: string;
  entryId: string;
  telegramAccountId: string;
};

const subscribeWorker = new Worker(
  "telegram-subscribe",
  async (job) => {
    const data = job.data as JoinCatalogEntryJob;
    log("info", "Processing join-catalog-entry job", { jobId: job.id, ...data });

    if (!internalToken) {
      throw new Error("INTERNAL_API_TOKEN is required for join-catalog-entry jobs");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), telegramWorkerTimeoutMs);

    try {
      const response = await fetch(`${telegramWorkerUrl}/internal/telegram/join-catalog-entry`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": internalToken
        },
        body: JSON.stringify({
          telegramAccountId: data.telegramAccountId,
          entryId: data.entryId,
          runId: data.runId
        }),
        signal: controller.signal
      });

      const bodyText = await response.text();
      let parsed: Record<string, unknown> | null = null;
      try {
        parsed = bodyText ? (JSON.parse(bodyText) as Record<string, unknown>) : null;
      } catch {
        parsed = null;
      }

      if (response.status === 429) {
        log("warn", "join-catalog-entry flood-wait", {
          jobId: job.id,
          runId: data.runId,
          entryId: data.entryId,
          telegramAccountId: data.telegramAccountId,
          body: bodyText
        });
        throw new Error(`join-catalog-entry flood-wait: ${bodyText}`);
      }

      if (!response.ok) {
        log("error", "join-catalog-entry failed", {
          jobId: job.id,
          runId: data.runId,
          entryId: data.entryId,
          telegramAccountId: data.telegramAccountId,
          status: response.status,
          body: bodyText
        });
        throw new Error(`join-catalog-entry failed: ${response.status} ${bodyText}`);
      }

      const joinStatus = typeof parsed?.status === "string" ? parsed.status : "unknown";
      if (joinStatus !== "joined" && joinStatus !== "private" && joinStatus !== "invalid") {
        log("error", "join-catalog-entry unexpected status", {
          jobId: job.id,
          runId: data.runId,
          entryId: data.entryId,
          telegramAccountId: data.telegramAccountId,
          result: parsed
        });
        throw new Error(`join-catalog-entry unexpected status: ${joinStatus}`);
      }

      const outcomeResponse = await fetch(`${apiInternalUrl}/internal/source-marketplace/join-outcome`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-token": internalToken
        },
        body: JSON.stringify({
          runId: data.runId,
          telegramAccountId: data.telegramAccountId,
          entryId: data.entryId,
          status: joinStatus,
          telegramChatId: typeof parsed?.telegramChatId === "string" ? parsed.telegramChatId : undefined,
          chatTitle:
            typeof parsed?.chatTitle === "string" || parsed?.chatTitle === null ? parsed.chatTitle : undefined,
          chatType: typeof parsed?.chatType === "string" || parsed?.chatType === null ? parsed.chatType : undefined
        })
      });

      const outcomeText = await outcomeResponse.text();
      if (!outcomeResponse.ok) {
        log("error", "join-outcome failed", {
          jobId: job.id,
          runId: data.runId,
          entryId: data.entryId,
          telegramAccountId: data.telegramAccountId,
          joinStatus,
          status: outcomeResponse.status,
          body: outcomeText
        });
        throw new Error(`join-outcome failed: ${outcomeResponse.status} ${outcomeText}`);
      }

      let outcomeParsed: Record<string, unknown> | null = null;
      try {
        outcomeParsed = outcomeText ? (JSON.parse(outcomeText) as Record<string, unknown>) : null;
      } catch {
        outcomeParsed = null;
      }

      if (joinStatus === "private" || joinStatus === "invalid") {
        log("warn", "join-catalog-entry skipped", {
          jobId: job.id,
          runId: data.runId,
          entryId: data.entryId,
          telegramAccountId: data.telegramAccountId,
          result: parsed,
          subscribeRun: outcomeParsed
        });
      } else {
        log("info", "join-catalog-entry completed", {
          jobId: job.id,
          runId: data.runId,
          entryId: data.entryId,
          telegramAccountId: data.telegramAccountId,
          result: parsed,
          subscribeRun: outcomeParsed
        });
      }

      return {
        join: parsed ?? { status: joinStatus },
        subscribeRun: outcomeParsed
      };
    } finally {
      clearTimeout(timeout);
    }
  },
  {
    connection,
    concurrency: subscribeConcurrency,
    lockDuration: telegramWorkerTimeoutMs + 5_000
  }
);

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
        "# HELP ai_worker_uptime_seconds AI worker uptime in seconds",
        "# TYPE ai_worker_uptime_seconds gauge",
        `ai_worker_uptime_seconds ${uptimeSeconds}`,
        "# HELP ai_worker_concurrency Configured AI worker concurrency",
        "# TYPE ai_worker_concurrency gauge",
        `ai_worker_concurrency ${aiConcurrency}`,
        "# HELP telegram_worker_concurrency Configured Telegram worker concurrency",
        "# TYPE telegram_worker_concurrency gauge",
        `telegram_worker_concurrency ${telegramConcurrency}`
      ].join("\n")
    );
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: { code: "NOT_FOUND", message: "Route not found" } }));
});

server.listen(healthPort, "0.0.0.0", () => {
  log("info", "AI worker started", {
    healthPort,
    aiConcurrency,
    telegramConcurrency,
    subscribeConcurrency,
    telegramWorkerUrl
  });
});

for (const worker of [aiWorker, followUpWorker, telegramSyncWorker, subscribeWorker]) {
  worker.on("completed", (job) => {
    log("info", "Queue job completed", { queue: worker.name, jobId: job.id });
  });
  worker.on("failed", (job, error) => {
    log("error", "Queue job failed", { queue: worker.name, jobId: job?.id, error: error.message });
  });
}

const shutdown = async () => {
  log("info", "Shutting down ai-worker");
  await Promise.all([
    aiWorker.close(),
    followUpWorker.close(),
    telegramSyncWorker.close(),
    subscribeWorker.close(),
    aiEvents.close(),
    followUpEvents.close(),
    telegramEvents.close(),
    subscribeEvents.close(),
    aiGenerationQueue.close(),
    followUpScanQueue.close(),
    telegramSyncQueue.close(),
    subscribeQueue.close(),
    deadLetterQueue.close()
  ]);
  server.close(() => process.exit(0));
};

process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
process.on("uncaughtException", (error) => {
  log("error", "Unhandled exception in AI worker", { error: error.message });
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  log("error", "Unhandled rejection in AI worker", { reason: String(reason) });
});
