import { LeadSource, LeadStage, LeadStatus, MessageDirection, type PrismaClient } from "@prisma/client";
import { syncLeadStageToConversationState } from "../state/lead-stage-sync.js";

const isPrismaUniqueViolation = (err: unknown): boolean =>
  typeof err === "object" && err !== null && (err as any).code === "P2002";

const NON_AUTOMATABLE_STAGES = new Set<LeadStage>([
  LeadStage.QUALIFIED,
  LeadStage.PROPOSAL,
  LeadStage.NEGOTIATION,
  LeadStage.WON,
  LeadStage.LOST
]);

const canAutoUpdateStage = (stage: LeadStage): boolean => !NON_AUTOMATABLE_STAGES.has(stage);

const isEligibleDirectHumanPeer = (params: {
  conversationType: "DIRECT" | "GROUP" | "CHANNEL";
  peerExternalId: string | null;
  peerIsBot: boolean;
  isServiceDialog: boolean;
  senderExternalId: string | null;
}): boolean => {
  if (params.conversationType !== "DIRECT") return false;
  if (!params.peerExternalId) return false;
  if (params.peerIsBot) return false;
  if (params.isServiceDialog) return false;
  if (params.senderExternalId && params.peerExternalId === params.senderExternalId) return false;
  return true;
};

const findCrmLeadByTelegramUserId = async (
  prisma: PrismaClient,
  params: { companyId: string; telegramUserId: string }
) => {
  const telegramUserId = params.telegramUserId.trim();
  if (!telegramUserId) return null;

  return prisma.lead.findFirst({
    where: {
      companyId: params.companyId,
      conversation: {
        participants: {
          some: {
            participant: {
              externalParticipantId: telegramUserId,
              isSelf: false
            }
          }
        }
      }
    },
    select: { id: true, conversationId: true }
  });
};

export async function ensureCrmLeadForOutbound(
  prisma: PrismaClient,
  params: {
    companyId: string;
    conversationId: string;
    ownerUserId?: string | null;
    conversationType: "DIRECT" | "GROUP" | "CHANNEL";
    peerExternalId: string | null;
    peerIsBot: boolean;
    isServiceDialog: boolean;
    senderExternalId: string | null;
  }
) {
  // Be conservative: only create outbound-first leads for DIRECT chats
  // with a known human peer, and never for service/bot/self dialogs.
  if (!isEligibleDirectHumanPeer(params)) return null;

  const existing = await prisma.lead.findUnique({
    where: { conversationId: params.conversationId }
  });
  if (existing) return existing;

  if (params.peerExternalId) {
    const existingByTelegramUserId = await findCrmLeadByTelegramUserId(prisma, {
      companyId: params.companyId,
      telegramUserId: params.peerExternalId
    });
    if (existingByTelegramUserId) {
      console.info(
        `[Ingestion] Skipped CRM Lead creation: user already exists in company companyId=${params.companyId} telegramUserId=${params.peerExternalId}`
      );
      return existingByTelegramUserId;
    }
  }

  try {
    const created = await prisma.lead.create({
      data: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        ownerUserId: params.ownerUserId ?? null,
        source: LeadSource.TELEGRAM,
        status: LeadStatus.OPEN,
        stage: LeadStage.CONTACTED
      }
    });
    await syncLeadStageToConversationState(prisma, {
      conversationId: params.conversationId,
      stage: LeadStage.CONTACTED
    });
    return created;
  } catch (err) {
    if (isPrismaUniqueViolation(err)) {
      return prisma.lead.findUnique({
        where: { conversationId: params.conversationId }
      });
    }
    throw err;
  }
}

export async function ensureCrmLeadForInbound(
  prisma: PrismaClient,
  params: {
    companyId: string;
    conversationId: string;
    ownerUserId?: string | null;
    conversationType: "DIRECT" | "GROUP" | "CHANNEL";
    peerExternalId: string | null;
    peerIsBot: boolean;
    isServiceDialog: boolean;
    senderExternalId: string | null;
    senderType: "user" | "self" | "system";
  }
) {
  // Be conservative: only auto-create leads for real DIRECT human dialogs.
  if (params.senderType !== "user") return null;
  if (!isEligibleDirectHumanPeer(params)) return null;

  const existing = await prisma.lead.findUnique({
    where: { conversationId: params.conversationId }
  });
  if (existing) return existing;

  if (params.peerExternalId) {
    const existingByTelegramUserId = await findCrmLeadByTelegramUserId(prisma, {
      companyId: params.companyId,
      telegramUserId: params.peerExternalId
    });
    if (existingByTelegramUserId) {
      console.info(
        `[Ingestion] Skipped CRM Lead creation: user already exists in company companyId=${params.companyId} telegramUserId=${params.peerExternalId}`
      );
      return existingByTelegramUserId;
    }
  }

  try {
    const created = await prisma.lead.create({
      data: {
        companyId: params.companyId,
        conversationId: params.conversationId,
        ownerUserId: params.ownerUserId ?? null,
        source: LeadSource.TELEGRAM,
        status: LeadStatus.NEW,
        stage: LeadStage.NEW
      }
    });
    await syncLeadStageToConversationState(prisma, { conversationId: params.conversationId, stage: LeadStage.NEW });
    return created;
  } catch (err) {
    // Idempotency/race safety: conversationId is unique.
    if (isPrismaUniqueViolation(err)) {
      return prisma.lead.findUnique({
        where: { conversationId: params.conversationId }
      });
    }
    throw err;
  }
}

export async function applyOutboundContactedStage(prisma: PrismaClient, params: { conversationId: string }) {
  const lead = await prisma.lead.findUnique({
    where: { conversationId: params.conversationId },
    select: { id: true, stage: true }
  });
  if (!lead) return null;

  if (!canAutoUpdateStage(lead.stage)) return lead;
  if (lead.stage === LeadStage.CONTACTED || lead.stage === LeadStage.REPLIED) return lead;

  if (lead.stage === LeadStage.NEW || lead.stage === LeadStage.IGNORED) {
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { stage: LeadStage.CONTACTED }
    });
    await syncLeadStageToConversationState(prisma, { conversationId: params.conversationId, stage: LeadStage.CONTACTED });
    return updated;
  }

  return lead;
}

export async function applyInboundRepliedStage(
  prisma: PrismaClient,
  params: {
    companyId: string;
    conversationId: string;
    inboundSentAt: Date;
    priorLastOutboundAt: Date | null;
    ownerUserId?: string | null;
  }
) {
  const lead = await prisma.lead.findUnique({ where: { conversationId: params.conversationId } });
  if (!lead) return null;
  if (!canAutoUpdateStage(lead.stage)) return lead;
  if (lead.stage === LeadStage.REPLIED) return lead;

  const priorOutboundExists =
    (params.priorLastOutboundAt ? params.priorLastOutboundAt.getTime() < params.inboundSentAt.getTime() : false) ||
    Boolean(
      await prisma.message.findFirst({
        where: {
          conversationId: params.conversationId,
          direction: MessageDirection.OUTBOUND,
          sentAt: { lt: params.inboundSentAt }
        },
        select: { id: true }
      })
    );

  if (!priorOutboundExists) {
    // No reply-to-our-message context; keep stage as-is (usually NEW).
    return lead;
  }

  if (lead.stage === LeadStage.NEW || lead.stage === LeadStage.CONTACTED || lead.stage === LeadStage.IGNORED) {
    const updated = await prisma.lead.update({
      where: { id: lead.id },
      data: { stage: LeadStage.REPLIED }
    });
    await syncLeadStageToConversationState(prisma, { conversationId: params.conversationId, stage: LeadStage.REPLIED });
    return updated;
  }

  return lead;
}
