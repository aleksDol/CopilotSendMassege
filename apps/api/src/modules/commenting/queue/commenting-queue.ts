import { Queue, type JobsOptions } from "bullmq";
import type { Env } from "../../../config/env.js";

export type CommentingGenerationJob = {
  telegramAccountId: string;
  channelId: string;
  postId: string;
};

export const COMMENTING_GENERATION_QUEUE_NAME = "commenting-generation" as const;
export const COMMENTING_GENERATION_JOB_NAME = "generate-comment" as const;

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

let queueSingleton: Queue<CommentingGenerationJob> | null = null;

export const getCommentingGenerationQueue = (env: Env): Queue<CommentingGenerationJob> => {
  if (queueSingleton) return queueSingleton;
  queueSingleton = new Queue<CommentingGenerationJob>(COMMENTING_GENERATION_QUEUE_NAME, {
    connection: toBullMqConnection(env.REDIS_URL),
    defaultJobOptions
  });
  return queueSingleton;
};

export const toCommentingGenerationJobId = (payload: CommentingGenerationJob) =>
  `commenting-${payload.telegramAccountId}-${payload.channelId}-${payload.postId}`;

export async function enqueueCommentingGenerationJob(
  env: Env,
  payload: CommentingGenerationJob
): Promise<{ jobId: string; deduped: boolean }> {
  const queue = getCommentingGenerationQueue(env);
  const jobId = toCommentingGenerationJobId(payload);

  try {
    await queue.add(COMMENTING_GENERATION_JOB_NAME, payload, { jobId });
    return { jobId, deduped: false };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
    if (message.includes("jobid") && message.includes("already exists")) {
      return { jobId, deduped: true };
    }
    throw error;
  }
}
