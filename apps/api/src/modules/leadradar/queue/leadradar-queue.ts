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

export const LEADRADAR_QUEUE_NAME = "leadradar-ingestion" as const;
export const LEADRADAR_JOB_NAME = "process-message" as const;
export const LEADRADAR_AUTHOR_PROFILE_CHECK_JOB_NAME = "author-profile-check" as const;

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

type LeadRadarQueueJobData = LeadRadarProcessMessageJob | LeadRadarAuthorProfileCheckJob;

let queueSingleton: Queue<LeadRadarQueueJobData> | null = null;

export const getLeadRadarQueue = (env: Env): Queue<LeadRadarQueueJobData> => {
  if (queueSingleton) return queueSingleton;
  queueSingleton = new Queue<LeadRadarQueueJobData>(LEADRADAR_QUEUE_NAME, {
    connection: toBullMqConnection(env.REDIS_URL),
    defaultJobOptions
  });
  return queueSingleton;
};

export const toLeadRadarJobId = (payload: Pick<LeadRadarProcessMessageJob, "telegramAccountId" | "chatId" | "externalMessageId">) =>
  // BullMQ prohibits ":" in custom jobId. Use "-" to keep it readable + stable.
  `leadradar-${payload.telegramAccountId}-${payload.chatId}-${payload.externalMessageId}`;

export async function enqueueLeadRadarJob(env: Env, payload: LeadRadarProcessMessageJob): Promise<{ jobId: string }> {
  const queue = getLeadRadarQueue(env);
  const jobId = toLeadRadarJobId(payload);

  await queue.add(LEADRADAR_JOB_NAME, payload, { jobId });
  return { jobId };
}

const normalizeUsername = (raw: string | null | undefined): string | null => {
  const t = raw?.trim();
  if (!t) return null;
  return t.replace(/^@+/u, "").toLowerCase();
};

export const toAuthorProfileCheckJobId = (
  payload: Pick<LeadRadarAuthorProfileCheckJob, "telegramAccountId" | "telegramUserId" | "username">
): string | null => {
  const telegramUserId = payload.telegramUserId?.trim();
  if (telegramUserId) {
    return `leadradar-author-profile-check-${payload.telegramAccountId}-${telegramUserId}`;
  }

  const username = normalizeUsername(payload.username);
  if (!username) return null;
  return `leadradar-author-profile-check-${payload.telegramAccountId}-username-${username}`;
};

export async function enqueueAuthorProfileCheck(
  env: Env,
  payload: LeadRadarAuthorProfileCheckJob
): Promise<{ enqueued: true; jobId: string } | { enqueued: false; reason: "missing_author_identity" }> {
  const jobId = toAuthorProfileCheckJobId(payload);
  if (!jobId) {
    return { enqueued: false, reason: "missing_author_identity" };
  }
  const queue = getLeadRadarQueue(env);

  await queue.add(LEADRADAR_AUTHOR_PROFILE_CHECK_JOB_NAME, payload, { jobId });
  return { enqueued: true, jobId };
}
