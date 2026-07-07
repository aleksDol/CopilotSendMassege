import { Queue, type JobsOptions } from "bullmq";
import type { Env } from "../../config/env.js";

export const SUBSCRIBE_QUEUE_NAME = "telegram-subscribe" as const;
export const JOIN_CATALOG_ENTRY_JOB_NAME = "join-catalog-entry" as const;

export type JoinCatalogEntryJob = {
  runId: string;
  entryId: string;
  telegramAccountId: string;
  traceId?: string;
};

const toBullMqConnection = (redisUrl: string) => {
  const url = new URL(redisUrl);
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username || undefined,
    password: url.password || undefined,
    db: url.pathname && url.pathname !== "/" ? Number(url.pathname.replace("/", "")) : 0
  };
};

const defaultJobOptions: JobsOptions = {
  attempts: 5,
  backoff: {
    type: "exponential",
    delay: 5000
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 10_000
  },
  removeOnFail: false
};

let queueSingleton: Queue<JoinCatalogEntryJob> | null = null;

export const getSubscribeQueue = (env: Env): Queue<JoinCatalogEntryJob> => {
  if (queueSingleton) return queueSingleton;
  queueSingleton = new Queue<JoinCatalogEntryJob>(SUBSCRIBE_QUEUE_NAME, {
    connection: toBullMqConnection(env.REDIS_URL),
    defaultJobOptions
  });
  return queueSingleton;
};

export const toJoinCatalogEntryJobId = (telegramAccountId: string, entryId: string) =>
  `subscribe-${telegramAccountId}-${entryId}`;

export async function enqueueJoinCatalogEntryJobs(
  env: Env,
  input: {
    runId: string;
    telegramAccountId: string;
    entryIds: string[];
    traceId?: string;
  }
): Promise<{ enqueued: number }> {
  if (!input.entryIds.length) {
    return { enqueued: 0 };
  }

  const queue = getSubscribeQueue(env);
  const joinIntervalMs = env.SOURCE_MARKETPLACE_JOIN_INTERVAL_MS;

  await Promise.all(
    input.entryIds.map((entryId, index) =>
      queue.add(
        JOIN_CATALOG_ENTRY_JOB_NAME,
        {
          runId: input.runId,
          entryId,
          telegramAccountId: input.telegramAccountId,
          traceId: input.traceId
        },
        {
          jobId: toJoinCatalogEntryJobId(input.telegramAccountId, entryId),
          delay: index * joinIntervalMs
        }
      )
    )
  );

  return { enqueued: input.entryIds.length };
}
