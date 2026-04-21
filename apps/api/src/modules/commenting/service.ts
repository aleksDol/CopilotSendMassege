import { CommentCandidateStatus, CommentPublishSource } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";
import { TelegramWorkerClient } from "../../lib/telegram-worker-client.js";

const mapStatus = (status: "new" | "published" | "ignored"): CommentCandidateStatus => {
  switch (status) {
    case "new":
      return CommentCandidateStatus.new;
    case "published":
      return CommentCandidateStatus.published;
    case "ignored":
      return CommentCandidateStatus.ignored;
  }
};

const mapCandidate = (candidate: {
  id: string;
  userId: string;
  telegramAccountId: string;
  channelId: string;
  postId: string;
  postText: string;
  aiComment: string | null;
  status: CommentCandidateStatus;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
  publishedBy: CommentPublishSource | null;
  autoPublishAttempts: number;
  autoPublishLastErrorAt: Date | null;
  autoPublishLastError: string | null;
}) => ({
  id: candidate.id,
  userId: candidate.userId,
  telegramAccountId: candidate.telegramAccountId,
  channelId: candidate.channelId,
  postId: candidate.postId,
  postText: candidate.postText,
  aiComment: candidate.aiComment,
  status: candidate.status,
  createdAt: candidate.createdAt,
  updatedAt: candidate.updatedAt,
  publishedAt: candidate.publishedAt,
  publishedBy: candidate.publishedBy,
  autoPublishAttempts: candidate.autoPublishAttempts,
  autoPublishLastErrorAt: candidate.autoPublishLastErrorAt,
  autoPublishLastError: candidate.autoPublishLastError
});

export const listCommentCandidates = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    userId: string;
    limit: number;
    status?: "new" | "published" | "ignored";
    onlyNew?: boolean;
  }
) => {
  const [state, exclusions] = await Promise.all([
    app.prisma.commentingUserState.upsert({
      where: { userId: params.userId },
      update: {},
      create: { userId: params.userId, lastSeenAt: new Date(0) },
      select: { lastSeenAt: true }
    }),
    app.prisma.commentingChannelExclusion.findMany({
      where: { userId: params.userId },
      select: { channelId: true }
    })
  ]);

  const excludedChannelIds = exclusions.map((x) => x.channelId);
  const candidates = await app.prisma.commentCandidate.findMany({
    where: {
      telegramAccount: {
        channelAccount: {
          companyId: params.companyId
        }
      },
      ...(excludedChannelIds.length ? { channelId: { notIn: excludedChannelIds } } : {}),
      ...(params.status ? { status: mapStatus(params.status) } : {}),
      ...(params.onlyNew ? { createdAt: { gt: state.lastSeenAt } } : {})
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit
  });

  return {
    items: candidates.map(mapCandidate),
    lastSeenAt: state.lastSeenAt.toISOString(),
    excludedChannelIds
  };
};

export const getCommentCandidate = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    id: string;
  }
) => {
  const candidate = await app.prisma.commentCandidate.findFirst({
    where: {
      id: params.id,
      telegramAccount: {
        channelAccount: {
          companyId: params.companyId
        }
      }
    }
  });

  if (!candidate) {
    throw new AppError(404, "COMMENT_CANDIDATE_NOT_FOUND", "Comment candidate not found");
  }

  return {
    item: mapCandidate(candidate)
  };
};

export const updateCommentCandidate = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    id: string;
    aiComment: string;
  }
) => {
  const candidate = await app.prisma.commentCandidate.findFirst({
    where: {
      id: params.id,
      telegramAccount: {
        channelAccount: {
          companyId: params.companyId
        }
      }
    },
    select: { id: true }
  });

  if (!candidate) {
    throw new AppError(404, "COMMENT_CANDIDATE_NOT_FOUND", "Comment candidate not found");
  }

  const updated = await app.prisma.commentCandidate.update({
    where: { id: candidate.id },
    data: { aiComment: params.aiComment }
  });

  return {
    item: mapCandidate(updated)
  };
};

export const ignoreCommentCandidate = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    id: string;
  }
) => {
  const candidate = await app.prisma.commentCandidate.findFirst({
    where: {
      id: params.id,
      telegramAccount: {
        channelAccount: {
          companyId: params.companyId
        }
      }
    },
    select: { id: true }
  });

  if (!candidate) {
    throw new AppError(404, "COMMENT_CANDIDATE_NOT_FOUND", "Comment candidate not found");
  }

  const updated = await app.prisma.commentCandidate.update({
    where: { id: candidate.id },
    data: { status: CommentCandidateStatus.ignored }
  });

  return {
    item: mapCandidate(updated)
  };
};

export const ensureCommentCandidateForPost = async (
  app: FastifyInstance,
  params: {
    userId: string;
    telegramAccountId: string;
    channelId: string;
    postId: string;
    postText: string;
  }
) => {
  const normalizedPostText = params.postText.trim();
  if (!normalizedPostText.length) {
    return { created: false };
  }

  await app.prisma.commentCandidate.upsert({
    where: {
      telegramAccountId_channelId_postId: {
        telegramAccountId: params.telegramAccountId,
        channelId: params.channelId,
        postId: params.postId
      }
    },
    update: {},
    create: {
      userId: params.userId,
      telegramAccountId: params.telegramAccountId,
      channelId: params.channelId,
      postId: params.postId,
      postText: normalizedPostText
    }
  });

  return { created: true };
};

const getWorkerClient = (app: FastifyInstance): TelegramWorkerClient =>
  new TelegramWorkerClient(
    app.config.env.TELEGRAM_WORKER_URL,
    app.config.env.INTERNAL_API_TOKEN,
    app.config.env.TELEGRAM_WORKER_TIMEOUT_MS
  );

export const publishCommentCandidate = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    id: string;
    source?: "manual" | "auto";
  }
) => {
  const candidate = await app.prisma.commentCandidate.findFirst({
    where: {
      id: params.id,
      telegramAccount: {
        channelAccount: {
          companyId: params.companyId
        }
      }
    },
    include: {
      telegramAccount: {
        select: {
          id: true,
          channelAccountId: true,
          channelAccount: {
            select: {
              companyId: true
            }
          }
        }
      }
    }
  });

  if (!candidate) {
    throw new AppError(404, "COMMENT_CANDIDATE_NOT_FOUND", "Comment candidate not found");
  }

  const source: CommentPublishSource =
    params.source === "auto" ? CommentPublishSource.auto : CommentPublishSource.manual;

  if (candidate.status === CommentCandidateStatus.published && candidate.publishedAt) {
    return {
      item: mapCandidate(candidate),
      alreadyPublished: true
    };
  }

  const text = candidate.aiComment?.trim();
  if (!text) {
    throw new AppError(400, "COMMENT_TEXT_REQUIRED", "Comment candidate has no generated text to publish");
  }

  app.log.info(
    {
      candidateId: candidate.id,
      telegramAccountId: candidate.telegramAccountId,
      channelId: candidate.channelId,
      postId: candidate.postId
    },
    "[Commenting] candidate publish started"
  );

  try {
    const worker = getWorkerClient(app);
    await worker.sendCommentToChannelPost({
      companyId: candidate.telegramAccount.channelAccount.companyId,
      channelAccountId: candidate.telegramAccount.channelAccountId,
      channelId: candidate.channelId,
      postId: candidate.postId,
      text
    });

    const publishedAt = new Date();
    const updated = await app.prisma.commentCandidate.update({
      where: { id: candidate.id },
      data: {
        status: CommentCandidateStatus.published,
        publishedAt,
        publishedBy: source,
        autoPublishLastError: null,
        autoPublishLastErrorAt: null
      }
    });

    app.log.info(
      {
        candidateId: candidate.id,
        telegramAccountId: candidate.telegramAccountId,
        channelId: candidate.channelId,
        postId: candidate.postId
      },
      "[Commenting] candidate published"
    );

    return {
      item: mapCandidate(updated),
      alreadyPublished: false
    };
  } catch (error) {
    app.log.error(
      {
        err: error,
        candidateId: candidate.id,
        telegramAccountId: candidate.telegramAccountId,
        channelId: candidate.channelId,
        postId: candidate.postId
      },
      "[Commenting] candidate publish failed"
    );
    throw error;
  }
};

export const publishCommentCandidateInternal = async (
  app: FastifyInstance,
  params: {
    id: string;
    source: "auto";
  }
) => {
  const candidate = await app.prisma.commentCandidate.findFirst({
    where: { id: params.id },
    select: {
      id: true,
      telegramAccount: { select: { channelAccount: { select: { companyId: true } } } }
    }
  });

  if (!candidate) {
    throw new AppError(404, "COMMENT_CANDIDATE_NOT_FOUND", "Comment candidate not found");
  }

  return publishCommentCandidate(app, {
    companyId: candidate.telegramAccount.channelAccount.companyId,
    id: candidate.id,
    source: "auto"
  });
};

export const getCommentingState = async (
  app: FastifyInstance,
  params: { userId: string }
) => {
  const state = await app.prisma.commentingUserState.upsert({
    where: { userId: params.userId },
    update: {},
    create: { userId: params.userId, lastSeenAt: new Date(0) },
    select: {
      lastSeenAt: true,
      autoCommentingEnabled: true,
      autoCommentingEnabledAt: true,
      autoCommentingPausedUntil: true,
      autoCommentingPauseReason: true,
      autoCommentingConsecutiveErrors: true,
      lastAutoPublishedAt: true
    }
  });
  const exclusions = await app.prisma.commentingChannelExclusion.findMany({
    where: { userId: params.userId },
    orderBy: [{ createdAt: "desc" }, { channelId: "asc" }],
    select: { channelId: true, createdAt: true }
  });

  return {
    lastSeenAt: state.lastSeenAt.toISOString(),
    autoCommentingEnabled: state.autoCommentingEnabled,
    autoCommentingEnabledAt: state.autoCommentingEnabledAt?.toISOString() ?? null,
    autoCommentingPausedUntil: state.autoCommentingPausedUntil?.toISOString() ?? null,
    autoCommentingPauseReason: state.autoCommentingPauseReason ?? null,
    autoCommentingConsecutiveErrors: state.autoCommentingConsecutiveErrors,
    lastAutoPublishedAt: state.lastAutoPublishedAt?.toISOString() ?? null,
    exclusions: exclusions.map((e) => ({ channelId: e.channelId, createdAt: e.createdAt.toISOString() }))
  };
};

export const setAutoCommentingEnabled = async (
  app: FastifyInstance,
  params: { userId: string; enabled: boolean }
) => {
  const now = new Date();
  const state = await app.prisma.commentingUserState.upsert({
    where: { userId: params.userId },
    update: {
      autoCommentingEnabled: params.enabled,
      autoCommentingEnabledAt: params.enabled ? now : null,
      autoCommentingPausedUntil: null,
      autoCommentingPauseReason: null,
      ...(params.enabled ? {} : { autoCommentingConsecutiveErrors: 0 })
    },
    create: {
      userId: params.userId,
      lastSeenAt: new Date(0),
      autoCommentingEnabled: params.enabled,
      autoCommentingEnabledAt: params.enabled ? now : null,
      autoCommentingConsecutiveErrors: 0
    },
    select: { userId: true }
  });

  return getCommentingState(app, { userId: state.userId });
};

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const startOfUtcWeek = (d: Date) => {
  const day = d.getUTCDay(); // 0 sunday
  const mondayBased = (day + 6) % 7; // 0 monday
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - mondayBased);
  return start;
};

export const getCommentingStats = async (app: FastifyInstance, params: { companyId: string; userId: string }) => {
  const now = new Date();
  const today = startOfUtcDay(now);
  const week = startOfUtcWeek(now);

  const [state, totalAuto, totalManual, todayAuto, weekAuto, publishedOk, failedAuto, lastAutoPublished] =
    await Promise.all([
      app.prisma.commentingUserState.upsert({
        where: { userId: params.userId },
        update: {},
        create: { userId: params.userId, lastSeenAt: new Date(0) },
        select: {
          autoCommentingEnabled: true,
          autoCommentingPausedUntil: true,
          autoCommentingPauseReason: true,
          autoCommentingConsecutiveErrors: true
        }
      }),
      app.prisma.commentCandidate.count({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          publishedBy: CommentPublishSource.auto,
          publishedAt: { not: null }
        }
      }),
      app.prisma.commentCandidate.count({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          publishedBy: CommentPublishSource.manual,
          publishedAt: { not: null }
        }
      }),
      app.prisma.commentCandidate.count({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          publishedBy: CommentPublishSource.auto,
          publishedAt: { gte: today }
        }
      }),
      app.prisma.commentCandidate.count({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          publishedBy: CommentPublishSource.auto,
          publishedAt: { gte: week }
        }
      }),
      app.prisma.commentCandidate.count({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          status: CommentCandidateStatus.published,
          publishedAt: { not: null }
        }
      }),
      app.prisma.commentCandidate.count({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          autoPublishLastErrorAt: { not: null },
          status: { not: CommentCandidateStatus.published }
        }
      }),
      app.prisma.commentCandidate.findFirst({
        where: {
          userId: params.userId,
          telegramAccount: { channelAccount: { companyId: params.companyId } },
          publishedBy: CommentPublishSource.auto,
          publishedAt: { not: null }
        },
        orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
        select: { publishedAt: true }
      })
    ]);

  return {
    autoMode: {
      enabled: state.autoCommentingEnabled,
      pausedUntil: state.autoCommentingPausedUntil?.toISOString() ?? null,
      pauseReason: state.autoCommentingPauseReason ?? null,
      consecutiveErrors: state.autoCommentingConsecutiveErrors
    },
    totals: {
      autoPublished: totalAuto,
      manualPublished: totalManual
    },
    windows: {
      autoPublishedToday: todayAuto,
      autoPublishedThisWeek: weekAuto
    },
    publishedSuccessfully: publishedOk,
    failedAutoPublishes: failedAuto,
    lastAutoPublishedAt: lastAutoPublished?.publishedAt?.toISOString() ?? null
  };
};

export const upsertCommentingState = async (
  app: FastifyInstance,
  params: { userId: string; lastSeenAt?: Date }
) => {
  const next = params.lastSeenAt ?? new Date();
  const state = await app.prisma.commentingUserState.upsert({
    where: { userId: params.userId },
    update: { lastSeenAt: next },
    create: { userId: params.userId, lastSeenAt: next },
    select: { lastSeenAt: true }
  });
  return { lastSeenAt: state.lastSeenAt.toISOString() };
};

export const listChannelExclusions = async (
  app: FastifyInstance,
  params: { userId: string }
) => {
  const exclusions = await app.prisma.commentingChannelExclusion.findMany({
    where: { userId: params.userId },
    orderBy: [{ createdAt: "desc" }, { channelId: "asc" }],
    select: { channelId: true, createdAt: true }
  });
  return { items: exclusions.map((e) => ({ channelId: e.channelId, createdAt: e.createdAt.toISOString() })) };
};

export const addChannelExclusion = async (
  app: FastifyInstance,
  params: { userId: string; channelId: string }
) => {
  const normalized = params.channelId.trim();
  if (!normalized.length) {
    throw new AppError(400, "CHANNEL_ID_REQUIRED", "channelId is required");
  }

  await app.prisma.commentingChannelExclusion.upsert({
    where: { userId_channelId: { userId: params.userId, channelId: normalized } },
    update: {},
    create: { userId: params.userId, channelId: normalized }
  });

  return listChannelExclusions(app, { userId: params.userId });
};

export const removeChannelExclusion = async (
  app: FastifyInstance,
  params: { userId: string; channelId: string }
) => {
  const normalized = params.channelId.trim();
  await app.prisma.commentingChannelExclusion.deleteMany({
    where: { userId: params.userId, channelId: normalized }
  });
  return listChannelExclusions(app, { userId: params.userId });
};
