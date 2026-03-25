import { ChannelAccountStatus, Prisma, TaskPriority, TaskStatus, TaskType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { invalidateCacheByPrefix } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";
import { decodeConversationCursor, encodeConversationCursor } from "../../lib/cursor.js";
import { invalidateConversationCaches } from "../conversations/service.js";

const DEFAULT_STATE = {
  leadStatus: "NEW" as const,
  leadStage: "NEW" as const,
  leadScore: 0,
  leadTemperature: "COLD" as const,
  summaryVersion: 0,
  stateVersion: 1,
  unansweredClientMessageCount: 0,
  isWaitingForReply: false
};

const mapTaskType = (type: "follow_up" | "call" | "message" | "review" | "manual") => {
  switch (type) {
    case "follow_up":
      return TaskType.FOLLOW_UP;
    case "call":
      return TaskType.CALL;
    case "message":
      return TaskType.MESSAGE;
    case "review":
      return TaskType.REVIEW;
    case "manual":
      return TaskType.MANUAL;
  }
};

const mapTaskStatus = (status: "open" | "in_progress" | "done" | "canceled") => {
  switch (status) {
    case "open":
      return TaskStatus.OPEN;
    case "in_progress":
      return TaskStatus.IN_PROGRESS;
    case "done":
      return TaskStatus.DONE;
    case "canceled":
      return TaskStatus.CANCELED;
  }
};

const mapTaskPriority = (priority: "low" | "medium" | "high" | "urgent") => {
  switch (priority) {
    case "low":
      return TaskPriority.LOW;
    case "medium":
      return TaskPriority.MEDIUM;
    case "high":
      return TaskPriority.HIGH;
    case "urgent":
      return TaskPriority.URGENT;
  }
};

const mapTask = (task: {
  id: string;
  taskType: TaskType;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: Date | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
  conversation: { id: string; title: string | null } | null;
  assignedUser: { id: string; fullName: string } | null;
}) => ({
  id: task.id,
  taskType: task.taskType.toLowerCase(),
  title: task.title,
  description: task.description,
  status: task.status.toLowerCase(),
  priority: task.priority.toLowerCase(),
  dueAt: task.dueAt,
  source: task.source.toLowerCase(),
  conversation: task.conversation,
  assignedUser: task.assignedUser,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
  completedAt: task.completedAt
});

const invalidateTaskRelatedCaches = async (app: FastifyInstance, companyId: string) => {
  await invalidateCacheByPrefix(app, `cache:dashboard:${companyId}:`);
  await invalidateConversationCaches(app, companyId);
};

export const refreshFollowUpState = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    conversationId: string;
  }
) => {
  const conversation = await app.prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      companyId: params.companyId
    },
    select: { id: true }
  });

  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  const openFollowUps = await app.prisma.task.findMany({
    where: {
      companyId: params.companyId,
      conversationId: params.conversationId,
      taskType: TaskType.FOLLOW_UP,
      status: {
        in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS]
      }
    },
    orderBy: [{ dueAt: "asc" }, { createdAt: "asc" }],
    select: {
      dueAt: true
    }
  });

  const nextDueAt = openFollowUps.find((task) => task.dueAt)?.dueAt ?? null;

  await app.prisma.conversationState.upsert({
    where: { conversationId: params.conversationId },
    create: {
      conversationId: params.conversationId,
      ...DEFAULT_STATE,
      followUpDueAt: nextDueAt,
      nextRecommendedAction: nextDueAt ? "follow_up" : null
    },
    update: {
      followUpDueAt: nextDueAt,
      nextRecommendedAction: nextDueAt ? "follow_up" : null
    }
  });
};

export const listTasks = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    status?: "open" | "in_progress" | "done" | "canceled";
    assignedUserId?: string;
    taskType?: "follow_up" | "call" | "message" | "review" | "manual";
    priority?: "low" | "medium" | "high" | "urgent";
    dueBefore?: string;
    dueAfter?: string;
    conversationId?: string;
    limit: number;
    cursor?: string;
  }
) => {
  const where: Prisma.TaskWhereInput = {
    companyId: params.companyId
  };

  if (params.status) {
    where.status = mapTaskStatus(params.status);
  }

  if (params.assignedUserId) {
    where.assignedUserId = params.assignedUserId;
  }

  if (params.taskType) {
    where.taskType = mapTaskType(params.taskType);
  }

  if (params.priority) {
    where.priority = mapTaskPriority(params.priority);
  }

  if (params.conversationId) {
    where.conversationId = params.conversationId;
  }

  if (params.dueBefore || params.dueAfter) {
    where.dueAt = {
      ...(params.dueBefore ? { lt: new Date(params.dueBefore) } : {}),
      ...(params.dueAfter ? { gte: new Date(params.dueAfter) } : {})
    };
  }

  if (params.cursor) {
    const decoded = decodeConversationCursor(params.cursor);
    const cursorDate = new Date(decoded.lastMessageAt);

    where.OR = [
      {
        updatedAt: {
          lt: cursorDate
        }
      },
      {
        AND: [
          { updatedAt: cursorDate },
          {
            id: {
              lt: decoded.conversationId
            }
          }
        ]
      }
    ];
  }

  const rows = await app.prisma.task.findMany({
    where,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: {
      conversation: {
        select: {
          id: true,
          title: true
        }
      },
      assignedUser: {
        select: {
          id: true,
          fullName: true
        }
      }
    },
    take: params.limit + 1
  });

  const hasNext = rows.length > params.limit;
  const items = rows.slice(0, params.limit).map(mapTask);

  const nextCursor = hasNext
    ? encodeConversationCursor({
        lastMessageAt: rows[params.limit - 1].updatedAt.toISOString(),
        conversationId: rows[params.limit - 1].id
      })
    : null;

  return {
    items,
    nextCursor
  };
};

export const createTask = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    currentUserId?: string;
    conversationId?: string;
    title: string;
    description?: string;
    taskType: "follow_up" | "call" | "message" | "review" | "manual";
    priority: "low" | "medium" | "high" | "urgent";
    dueAt?: string;
    assignedUserId?: string;
    source?: "manual" | "system" | "ai";
  }
) => {
  if (params.conversationId) {
    const conversation = await app.prisma.conversation.findFirst({
      where: {
        id: params.conversationId,
        companyId: params.companyId
      },
      select: { id: true }
    });

    if (!conversation) {
      throw new AppError(400, "INVALID_CONVERSATION", "Conversation does not belong to workspace");
    }
  }

  if (params.assignedUserId) {
    const assignee = await app.prisma.user.findFirst({
      where: {
        id: params.assignedUserId,
        companyId: params.companyId,
        isActive: true
      },
      select: { id: true }
    });

    if (!assignee) {
      throw new AppError(400, "INVALID_ASSIGNEE", "Assigned user not found in workspace");
    }
  }

  const task = await app.prisma.task.create({
    data: {
      companyId: params.companyId,
      conversationId: params.conversationId,
      assignedUserId: params.assignedUserId ?? params.currentUserId ?? null,
      taskType: mapTaskType(params.taskType),
      title: params.title,
      description: params.description ?? null,
      status: TaskStatus.OPEN,
      priority: mapTaskPriority(params.priority),
      dueAt: params.dueAt ? new Date(params.dueAt) : null,
      source:
        params.source === "ai"
          ? "AI"
          : params.source === "system"
            ? "SYSTEM"
            : "MANUAL"
    },
    include: {
      conversation: {
        select: {
          id: true,
          title: true
        }
      },
      assignedUser: {
        select: {
          id: true,
          fullName: true
        }
      }
    }
  });

  if (task.taskType === TaskType.FOLLOW_UP && task.conversationId) {
    await refreshFollowUpState(app, { companyId: params.companyId, conversationId: task.conversationId });
  }

  await invalidateTaskRelatedCaches(app, params.companyId);

  return {
    item: mapTask(task)
  };
};

export const patchTask = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    taskId: string;
    title?: string;
    description?: string | null;
    priority?: "low" | "medium" | "high" | "urgent";
    dueAt?: string | null;
    assignedUserId?: string | null;
    status?: "open" | "in_progress" | "done" | "canceled";
  }
) => {
  const existing = await app.prisma.task.findFirst({
    where: { id: params.taskId, companyId: params.companyId }
  });

  if (!existing) {
    throw new AppError(404, "TASK_NOT_FOUND", "Task not found");
  }

  if (params.assignedUserId) {
    const assignee = await app.prisma.user.findFirst({
      where: {
        id: params.assignedUserId,
        companyId: params.companyId,
        isActive: true
      }
    });

    if (!assignee) {
      throw new AppError(400, "INVALID_ASSIGNEE", "Assigned user not found in workspace");
    }
  }

  const mappedStatus = params.status ? mapTaskStatus(params.status) : undefined;

  const updated = await app.prisma.task.update({
    where: { id: params.taskId },
    data: {
      ...(params.title !== undefined ? { title: params.title } : {}),
      ...(params.description !== undefined ? { description: params.description } : {}),
      ...(params.priority ? { priority: mapTaskPriority(params.priority) } : {}),
      ...(params.dueAt !== undefined ? { dueAt: params.dueAt ? new Date(params.dueAt) : null } : {}),
      ...(params.assignedUserId !== undefined ? { assignedUserId: params.assignedUserId } : {}),
      ...(mappedStatus
        ? {
            status: mappedStatus,
            completedAt: mappedStatus === TaskStatus.DONE ? new Date() : null
          }
        : {})
    },
    include: {
      conversation: {
        select: {
          id: true,
          title: true
        }
      },
      assignedUser: {
        select: {
          id: true,
          fullName: true
        }
      }
    }
  });

  if (updated.taskType === TaskType.FOLLOW_UP && updated.conversationId) {
    await refreshFollowUpState(app, { companyId: params.companyId, conversationId: updated.conversationId });
  }

  await invalidateTaskRelatedCaches(app, params.companyId);

  return {
    item: mapTask(updated)
  };
};

export const completeTask = async (app: FastifyInstance, params: { companyId: string; taskId: string }) => {
  return patchTask(app, {
    companyId: params.companyId,
    taskId: params.taskId,
    status: "done"
  });
};

export const reopenTask = async (app: FastifyInstance, params: { companyId: string; taskId: string }) => {
  return patchTask(app, {
    companyId: params.companyId,
    taskId: params.taskId,
    status: "open"
  });
};

export const listConversationTasks = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    conversationId: string;
    limit: number;
  }
) => {
  const conversation = await app.prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      companyId: params.companyId,
      channelAccount: { status: { not: ChannelAccountStatus.DISCONNECTED } }
    },
    select: { id: true }
  });

  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  const items = await app.prisma.task.findMany({
    where: {
      companyId: params.companyId,
      conversationId: params.conversationId
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: params.limit,
    include: {
      conversation: {
        select: { id: true, title: true }
      },
      assignedUser: {
        select: { id: true, fullName: true }
      }
    }
  });

  return {
    items: items.map(mapTask)
  };
};
