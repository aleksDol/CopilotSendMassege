import type { PrismaClient, LeadStage } from "@prisma/client";

export async function syncLeadStageToConversationState(
  prisma: PrismaClient,
  params: {
    conversationId: string;
    stage: LeadStage;
  }
) {
  // Intentionally update ONLY the main chat badge driver (ConversationState.leadStage).
  // Do not touch waiting/unanswered/temperature timestamps, or any other state fields.
  return prisma.conversationState.upsert({
    where: { conversationId: params.conversationId },
    create: {
      conversationId: params.conversationId,
      leadStage: params.stage
    },
    update: {
      leadStage: params.stage
    }
  });
}

