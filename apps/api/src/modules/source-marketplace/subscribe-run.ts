import type { PrismaClient, SourceMarketplaceSubscribeRun, SourceMarketplaceSubscribeRunStatus } from "@prisma/client";
import type { Redis } from "ioredis";
import type { Env } from "../../config/env.js";
import { AppError } from "../../lib/errors.js";
import type { SystemLogger } from "../../lib/system-log.js";
import { PrismaLeadSourceRepository } from "../leadradar/infrastructure/repositories/prisma/index.js";
import { enqueueJoinCatalogEntryJobs } from "./subscribe-queue.js";

const SYSTEM_LOG_MODULE = "marketplace";

export type SubscribeRunCounts = {
  totalCount: number;
  joinedCount: number;
  skippedCount: number;
  failedCount: number;
};

export type SubscribeRunProgress = SubscribeRunCounts & {
  activeCount: number;
  percent: number;
};

export const computeSubscribeRunProgress = (counts: SubscribeRunCounts): SubscribeRunProgress => {
  const denominator = counts.totalCount + counts.skippedCount;
  const numerator = counts.joinedCount + counts.skippedCount + counts.failedCount;
  const percent = denominator === 0 ? 100 : Math.min(100, Math.round((numerator / denominator) * 100));
  const activeCount = counts.joinedCount + counts.skippedCount;

  return {
    ...counts,
    activeCount,
    percent
  };
};

export const mapSubscribeRunResponse = (run: SourceMarketplaceSubscribeRun) => {
  const progress = computeSubscribeRunProgress({
    totalCount: run.totalCount,
    joinedCount: run.joinedCount,
    skippedCount: run.skippedCount,
    failedCount: run.failedCount
  });

  return {
    id: run.id,
    status: run.status,
    totalCount: progress.totalCount,
    joinedCount: progress.joinedCount,
    skippedCount: progress.skippedCount,
    failedCount: progress.failedCount,
    activeCount: progress.activeCount,
    percent: progress.percent,
    lastError: run.lastError
  };
};

type CatalogEntryRef = {
  id: string;
  telegramChatId: string | null;
};

export const partitionCatalogEntriesByExistingSources = (
  entries: CatalogEntryRef[],
  existingChatIds: Set<string>
): { toConnectEntryIds: string[]; skippedCount: number } => {
  const seenEntryIds = new Set<string>();
  const toConnectEntryIds: string[] = [];
  let skippedCount = 0;

  for (const entry of entries) {
    if (seenEntryIds.has(entry.id)) continue;
    seenEntryIds.add(entry.id);

    const chatId = entry.telegramChatId?.trim();
    if (chatId && existingChatIds.has(chatId)) {
      skippedCount += 1;
      continue;
    }

    toConnectEntryIds.push(entry.id);
  }

  return { toConnectEntryIds, skippedCount };
};

export type SubscribeJoinOutcome = "joined" | "private" | "invalid";

export const resolveSubscribeRunStatusAfterOutcome = (
  run: Pick<SourceMarketplaceSubscribeRun, "totalCount" | "joinedCount" | "failedCount" | "status">,
  outcome: SubscribeJoinOutcome
): {
  nextJoinedCount: number;
  nextFailedCount: number;
  nextStatus: SourceMarketplaceSubscribeRunStatus;
} => {
  const nextJoinedCount = run.joinedCount + (outcome === "joined" ? 1 : 0);
  const nextFailedCount = run.failedCount + (outcome === "joined" ? 0 : 1);
  const isComplete = nextJoinedCount + nextFailedCount >= run.totalCount;
  const nextStatus: SourceMarketplaceSubscribeRunStatus = isComplete
    ? "completed"
    : run.status === "pending"
      ? "running"
      : run.status;

  return { nextJoinedCount, nextFailedCount, nextStatus };
};

const subscribeRunEntryIdempotencyKey = (runId: string, entryId: string) =>
  `subscribe-run:${runId}:entry:${entryId}`;

export async function applySubscribeJoinOutcome(
  prisma: PrismaClient,
  redis: Redis,
  input: {
    runId: string;
    telegramAccountId: string;
    entryId: string;
    status: SubscribeJoinOutcome;
    telegramChatId?: string;
    chatTitle?: string | null;
    chatType?: string | null;
    traceId?: string;
  },
  systemLog?: SystemLogger
) {
  const idempotencyKey = subscribeRunEntryIdempotencyKey(input.runId, input.entryId);
  const acquired = await redis.set(idempotencyKey, "1", "EX", 7 * 24 * 3600, "NX");
  if (acquired !== "OK") {
    const existingRun = await prisma.sourceMarketplaceSubscribeRun.findUnique({
      where: { id: input.runId }
    });
    if (!existingRun) {
      throw new AppError(404, "SUBSCRIBE_RUN_NOT_FOUND", "Subscribe run not found");
    }
    return mapSubscribeRunResponse(existingRun);
  }

  try {
    const run = await prisma.sourceMarketplaceSubscribeRun.findUnique({
      where: { id: input.runId }
    });

    if (!run) {
      throw new AppError(404, "SUBSCRIBE_RUN_NOT_FOUND", "Subscribe run not found");
    }

    if (run.telegramAccountId !== input.telegramAccountId) {
      throw new AppError(400, "SUBSCRIBE_RUN_SCOPE_MISMATCH", "Subscribe run account mismatch");
    }

    if (input.status === "joined") {
      const telegramChatId = input.telegramChatId?.trim();
      if (!telegramChatId) {
        throw new AppError(400, "TELEGRAM_CHAT_ID_REQUIRED", "telegramChatId is required for joined outcome");
      }

      // Existence check is only used to pick the log event name. It must never
      // break the join flow, so a lookup failure defaults to "created".
      let sourceExisted = false;
      try {
        const existingSource = await prisma.leadRadarSource.findUnique({
          where: {
            telegramAccountId_telegramChatId: {
              telegramAccountId: input.telegramAccountId,
              telegramChatId
            }
          },
          select: { id: true }
        });
        sourceExisted = existingSource !== null;
      } catch {
        sourceExisted = false;
      }

      const sourceRepo = new PrismaLeadSourceRepository(prisma);
      await sourceRepo.addSource({
        user_id: run.userId,
        telegram_account_id: input.telegramAccountId,
        telegram_chat_id: telegramChatId,
        chat_title: input.chatTitle ?? null,
        chat_type: input.chatType ?? null,
        is_active: true
      });

      systemLog?.info({
        module: SYSTEM_LOG_MODULE,
        event: sourceExisted ? "LeadRadarSourceUpdated" : "LeadRadarSourceCreated",
        traceId: input.traceId,
        userId: run.userId,
        metadata: {
          runId: run.id,
          entryId: input.entryId,
          telegramChatId
        }
      });
    }

    const { nextJoinedCount, nextFailedCount, nextStatus } = resolveSubscribeRunStatusAfterOutcome(
      run,
      input.status
    );

    const updatedRun = await prisma.sourceMarketplaceSubscribeRun.update({
      where: { id: run.id },
      data: {
        joinedCount: nextJoinedCount,
        failedCount: nextFailedCount,
        status: nextStatus
      }
    });

    systemLog?.info({
      module: SYSTEM_LOG_MODULE,
      event: "SubscribeRunIncrement",
      traceId: input.traceId,
      userId: run.userId,
      metadata: {
        runId: run.id,
        entryId: input.entryId,
        outcome: input.status,
        joinedCount: nextJoinedCount,
        failedCount: nextFailedCount
      }
    });

    if (nextStatus === "completed") {
      systemLog?.info({
        module: SYSTEM_LOG_MODULE,
        event: "RunCompleted",
        traceId: input.traceId,
        userId: run.userId,
        metadata: {
          runId: run.id,
          joinedCount: nextJoinedCount,
          failedCount: nextFailedCount,
          skippedCount: updatedRun.skippedCount
        }
      });
    }

    return mapSubscribeRunResponse(updatedRun);
  } catch (error) {
    await redis.del(idempotencyKey);
    throw error;
  }
}

export async function startSubscribeRun(
  prisma: PrismaClient,
  params: {
    userId: string;
    companyId?: string;
    telegramAccountId: string;
    topicIds: string[];
    traceId?: string;
  },
  env: Env,
  systemLog?: SystemLogger
) {
  const uniqueTopicIds = [...new Set(params.topicIds)];
  if (!uniqueTopicIds.length) {
    throw new AppError(400, "TOPICS_REQUIRED", "Select at least one topic");
  }

  const activeTopics = await prisma.sourceMarketplaceTopic.findMany({
    where: {
      id: { in: uniqueTopicIds },
      status: "active"
    },
    select: { id: true }
  });

  if (activeTopics.length !== uniqueTopicIds.length) {
    throw new AppError(400, "TOPIC_NOT_AVAILABLE", "One or more topics are not published");
  }

  const catalogEntries = await prisma.sourceMarketplaceEntry.findMany({
    where: {
      status: "active",
      topics: { some: { topicId: { in: uniqueTopicIds } } }
    },
    select: {
      id: true,
      telegramChatId: true
    }
  });

  const existingSources = await prisma.leadRadarSource.findMany({
    where: {
      userId: params.userId,
      telegramAccountId: params.telegramAccountId
    },
    select: { telegramChatId: true }
  });

  const existingChatIds = new Set(
    existingSources.map((row) => row.telegramChatId.trim()).filter((chatId) => chatId.length > 0)
  );

  const { toConnectEntryIds, skippedCount } = partitionCatalogEntriesByExistingSources(
    catalogEntries,
    existingChatIds
  );

  const toConnectCount = toConnectEntryIds.length;
  const status = toConnectCount > 0 ? "running" : "completed";

  const run = await prisma.sourceMarketplaceSubscribeRun.create({
    data: {
      userId: params.userId,
      telegramAccountId: params.telegramAccountId,
      topicIds: uniqueTopicIds,
      status,
      totalCount: toConnectCount,
      joinedCount: 0,
      skippedCount,
      failedCount: 0
    }
  });

  if (toConnectEntryIds.length > 0) {
    await enqueueJoinCatalogEntryJobs(env, {
      runId: run.id,
      telegramAccountId: params.telegramAccountId,
      entryIds: toConnectEntryIds,
      traceId: params.traceId
    });

    systemLog?.info({
      module: SYSTEM_LOG_MODULE,
      event: "QueueCreated",
      traceId: params.traceId,
      userId: params.userId,
      companyId: params.companyId,
      metadata: {
        runId: run.id,
        jobCount: toConnectCount,
        topicCount: uniqueTopicIds.length,
        skippedCount
      }
    });
  } else {
    // Nothing to connect -> the run is already completed synchronously.
    systemLog?.info({
      module: SYSTEM_LOG_MODULE,
      event: "RunCompleted",
      traceId: params.traceId,
      userId: params.userId,
      companyId: params.companyId,
      metadata: {
        runId: run.id,
        joinedCount: 0,
        failedCount: 0,
        skippedCount
      }
    });
  }

  return mapSubscribeRunResponse(run);
}

export async function getSubscribeRun(
  prisma: PrismaClient,
  params: { runId: string; userId: string }
) {
  const run = await prisma.sourceMarketplaceSubscribeRun.findFirst({
    where: {
      id: params.runId,
      userId: params.userId
    }
  });

  if (!run) {
    throw new AppError(404, "SUBSCRIBE_RUN_NOT_FOUND", "Subscribe run not found");
  }

  return mapSubscribeRunResponse(run);
}
