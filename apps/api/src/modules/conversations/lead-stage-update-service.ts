import { LeadSource, LeadStage, LeadStatus, type PrismaClient } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { syncLeadStageToConversationState } from "../state/lead-stage-sync.js";

export async function updateConversationLeadStage(
  prisma: PrismaClient,
  params: {
    companyId: string;
    conversationId: string;
    stage: LeadStage;
    now?: Date;
  }
) {
  const now = params.now ?? new Date();

  const conversation = await prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      companyId: params.companyId
    },
    select: {
      id: true,
      companyId: true,
      channelAccount: {
        select: {
          createdByUserId: true
        }
      }
    }
  });

  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  const ownerUserId = conversation.channelAccount.createdByUserId ?? null;

  const isTerminal = params.stage === LeadStage.WON || params.stage === LeadStage.LOST;
  const nextStatus: LeadStatus =
    params.stage === LeadStage.NEW
      ? LeadStatus.NEW
      : params.stage === LeadStage.WON
        ? LeadStatus.WON
        : params.stage === LeadStage.LOST
          ? LeadStatus.LOST
          : LeadStatus.OPEN;

  return prisma.$transaction(async (tx) => {
    const existing = await tx.lead.findUnique({
      where: { conversationId: conversation.id }
    });

    const baseData = {
      status: nextStatus,
      stage: params.stage
    } as const;

    const terminalData =
      params.stage === LeadStage.WON
        ? {
            wonAt: existing?.wonAt ?? now,
            lostAt: null
          }
        : params.stage === LeadStage.LOST
          ? {
              lostAt: existing?.lostAt ?? now,
              wonAt: null
            }
          : {
              wonAt: null,
              lostAt: null
            };

    const lead =
      existing
        ? await tx.lead.update({
            where: { id: existing.id },
            data: {
              ...baseData,
              ...terminalData
            }
          })
        : await tx.lead.create({
            data: {
              companyId: conversation.companyId,
              conversationId: conversation.id,
              ownerUserId,
              source: LeadSource.TELEGRAM,
              ...baseData,
              ...terminalData
            }
          });

    // Chat list badge driver: sync ONLY leadStage into conversation_state.
    await syncLeadStageToConversationState(tx as unknown as PrismaClient, {
      conversationId: conversation.id,
      stage: lead.stage
    });

    return {
      leadId: lead.id,
      conversationId: lead.conversationId,
      status: lead.status,
      stage: lead.stage,
      wonAt: lead.wonAt,
      lostAt: lead.lostAt
    };
  });
}

