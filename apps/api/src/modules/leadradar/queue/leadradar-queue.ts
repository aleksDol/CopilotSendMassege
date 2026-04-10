import { Queue, type JobsOptions } from "bullmq";
import type { Env } from "../../../config/env.js";

export type LeadRadarSourceHints = {
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

export const LEADRADAR_QUEUE_NAME = "leadradar-ingestion" as const;
export const LEADRADAR_JOB_NAME = "process-message" as const;

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
    delay: 2000
  },
  removeOnComplete: {
    age: 24 * 3600,
    count: 10_000
  },
  removeOnFail: false
};

let queueSingleton: Queue<LeadRadarProcessMessageJob> | null = null;

export const getLeadRadarQueue = (env: Env): Queue<LeadRadarProcessMessageJob> => {
  if (queueSingleton) return queueSingleton;
  queueSingleton = new Queue<LeadRadarProcessMessageJob>(LEADRADAR_QUEUE_NAME, {
    connection: toBullMqConnection(env.REDIS_URL),
    defaultJobOptions
  });
  return queueSingleton;
};

export const toLeadRadarJobId = (payload: Pick<LeadRadarProcessMessageJob, "telegramAccountId" | "chatId" | "externalMessageId">) =>
  `leadradar:${payload.telegramAccountId}:${payload.chatId}:${payload.externalMessageId}`;

export async function enqueueLeadRadarJob(env: Env, payload: LeadRadarProcessMessageJob): Promise<{ jobId: string }> {
  const queue = getLeadRadarQueue(env);
  const jobId = toLeadRadarJobId(payload);

  await queue.add(LEADRADAR_JOB_NAME, payload, { jobId });
  return { jobId };
}

