import { CommentCandidateStatus } from "@prisma/client";
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
  publishedAt: candidate.publishedAt
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
      ...(params.onlyNew === false ? {} : { createdAt: { gt: state.lastSeenAt } })
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
        publishedAt
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

export const getCommentingState = async (
  app: FastifyInstance,
  params: { userId: string }
) => {
  const state = await app.prisma.commentingUserState.upsert({
    where: { userId: params.userId },
    update: {},
    create: { userId: params.userId, lastSeenAt: new Date(0) },
    select: { lastSeenAt: true }
  });
  const exclusions = await app.prisma.commentingChannelExclusion.findMany({
    where: { userId: params.userId },
    orderBy: [{ createdAt: "desc" }, { channelId: "asc" }],
    select: { channelId: true, createdAt: true }
  });

  return {
    lastSeenAt: state.lastSeenAt.toISOString(),
    exclusions: exclusions.map((e) => ({ channelId: e.channelId, createdAt: e.createdAt.toISOString() }))
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
