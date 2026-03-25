import { LeadStatus, LeadTemperature, TaskStatus, TaskType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { createTask, refreshFollowUpState } from "../tasks/service.js";

type FollowUpRunResult = {
  scanned: number;
  created: number;
  skippedExisting: number;
};

const getDefaultAssigneeId = async (app: FastifyInstance, companyId: string): Promise<string | null> => {
  const owner = await app.prisma.user.findFirst({
    where: {
      companyId,
      role: "OWNER",
      isActive: true
    },
    select: { id: true }
  });

  return owner?.id ?? null;
};

const hasOpenFollowUpTask = async (app: FastifyInstance, companyId: string, conversationId: string) => {
  const existing = await app.prisma.task.findFirst({
    where: {
      companyId,
      conversationId,
      taskType: TaskType.FOLLOW_UP,
      status: {
        in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS]
      }
    },
    select: { id: true }
  });

  return Boolean(existing);
};

export const scanAndCreateFollowUps = async (
  app: FastifyInstance,
  params: { companyId?: string; dryRun?: boolean }
): Promise<FollowUpRunResult> => {
  const now = new Date();
  const unansweredCutoff = new Date(now.getTime() - app.config.env.FOLLOW_UP_UNANSWERED_HOURS * 60 * 60 * 1000);
  const warmLeadCutoff = new Date(now.getTime() - app.config.env.FOLLOW_UP_WARM_LEAD_HOURS * 60 * 60 * 1000);

  const states = await app.prisma.conversationState.findMany({
    where: {
      conversation: {
        ...(params.companyId ? { companyId: params.companyId } : {})
      }
    },
    include: {
      conversation: {
        select: {
          id: true,
          companyId: true,
          title: true,
          assignedUserId: true
        }
      }
    },
    take: 500
  });

  let scanned = 0;
  let created = 0;
  let skippedExisting = 0;

  for (const state of states) {
    scanned += 1;

    let shouldCreate = false;
    let title = "Follow up with client";
    let description = "";
    let priority: "medium" | "high" = "medium";
    let dueAt = new Date(now.getTime() + 60 * 60 * 1000);

    if (state.isWaitingForReply && state.lastInboundAt && state.lastInboundAt <= unansweredCutoff) {
      shouldCreate = true;
      title = "Reply to client";
      description = "Client message has been waiting for reply beyond threshold.";
      priority = "high";
      dueAt = new Date(now.getTime() + 15 * 60 * 1000);
    } else if (
      state.lastMessageAt &&
      state.lastMessageAt <= warmLeadCutoff &&
      (state.leadTemperature === LeadTemperature.WARM || state.leadTemperature === LeadTemperature.HOT) &&
      (state.leadStatus === LeadStatus.NEW || state.leadStatus === LeadStatus.OPEN)
    ) {
      shouldCreate = true;
      title = state.leadTemperature === LeadTemperature.HOT ? "Re-engage hot lead" : "Follow up warm lead";
      description = "Lead conversation is inactive for too long.";
      priority = state.leadTemperature === LeadTemperature.HOT ? "high" : "medium";
      dueAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    }

    if (!shouldCreate) {
      continue;
    }

    const exists = await hasOpenFollowUpTask(app, state.conversation.companyId, state.conversation.id);
    if (exists) {
      skippedExisting += 1;
      continue;
    }

    if (params.dryRun) {
      created += 1;
      continue;
    }

    const defaultAssigneeId = state.conversation.assignedUserId ?? (await getDefaultAssigneeId(app, state.conversation.companyId));

    await createTask(app, {
      companyId: state.conversation.companyId,
      currentUserId: defaultAssigneeId ?? state.conversation.assignedUserId ?? undefined,
      conversationId: state.conversation.id,
      title,
      description,
      taskType: "follow_up",
      priority,
      dueAt: dueAt.toISOString(),
      assignedUserId: defaultAssigneeId ?? undefined,
      source: "system"
    });

    await refreshFollowUpState(app, { companyId: state.conversation.companyId, conversationId: state.conversation.id });
    created += 1;
  }

  return {
    scanned,
    created,
    skippedExisting
  };
};
