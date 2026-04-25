import { LeadStage, LeadStatus, type PrismaClient } from "@prisma/client";
import { syncLeadStageToConversationState } from "../state/lead-stage-sync.js";

export type IgnoredSweepResult = {
  scanned: number;
  markedIgnored: number;
  skippedNoLead: number;
  skippedNotEligibleStage: number;
  skippedUpdatedConcurrently: number;
};

export async function markContactedLeadsIgnored(
  prisma: PrismaClient,
  params: {
    now?: Date;
    unansweredHours: number;
    limit?: number;
    logger?: {
      info: (obj: any, msg?: string) => void;
      warn: (obj: any, msg?: string) => void;
    };
  }
): Promise<IgnoredSweepResult> {
  const now = params.now ?? new Date();
  const threshold = new Date(now.getTime() - params.unansweredHours * 60 * 60 * 1000);
  const take = params.limit ?? 500;

  params.logger?.info(
    { threshold: threshold.toISOString(), take },
    "ignored_sweep_started"
  );

  const states = await prisma.conversationState.findMany({
    where: {
      lastOutboundAt: { not: null, lte: threshold },
      conversation: {
        lead: {
          is: {
            stage: LeadStage.CONTACTED,
            status: { notIn: [LeadStatus.WON, LeadStatus.LOST] }
          }
        }
      }
    },
    include: {
      conversation: {
        select: {
          id: true,
          lead: {
            select: {
              id: true,
              stage: true,
              status: true
            }
          }
        }
      }
    },
    take
  });

  let scanned = 0;
  let markedIgnored = 0;
  let skippedNoLead = 0;
  let skippedNotEligibleStage = 0;
  let skippedUpdatedConcurrently = 0;

  for (const state of states) {
    scanned += 1;
    const lead = state.conversation.lead;
    if (!lead) {
      skippedNoLead += 1;
      continue;
    }

    // Only mark ignored when there was no inbound after the last outbound.
    // Prisma doesn't support field-to-field comparisons in where clauses, so we enforce it here.
    if (state.lastInboundAt && state.lastOutboundAt && state.lastInboundAt.getTime() >= state.lastOutboundAt.getTime()) {
      skippedNotEligibleStage += 1;
      continue;
    }

    if (lead.stage !== LeadStage.CONTACTED || lead.status === LeadStatus.WON || lead.status === LeadStatus.LOST) {
      skippedNotEligibleStage += 1;
      continue;
    }

    const updated = await prisma.lead.updateMany({
      where: { id: lead.id, stage: LeadStage.CONTACTED, status: { notIn: [LeadStatus.WON, LeadStatus.LOST] } },
      data: { stage: LeadStage.IGNORED }
    });

    if (updated.count === 0) {
      skippedUpdatedConcurrently += 1;
      continue;
    }

    await syncLeadStageToConversationState(prisma, {
      conversationId: state.conversation.id,
      stage: LeadStage.IGNORED
    });

    markedIgnored += 1;
    params.logger?.info(
      {
        leadId: lead.id,
        conversationId: state.conversation.id,
        lastOutboundAt: state.lastOutboundAt?.toISOString() ?? null,
        lastInboundAt: state.lastInboundAt?.toISOString() ?? null,
        threshold: threshold.toISOString()
      },
      "ignored_stage_set"
    );
  }

  params.logger?.info(
    { scanned, markedIgnored, skippedNoLead, skippedNotEligibleStage, skippedUpdatedConcurrently },
    "ignored_sweep_completed"
  );

  return { scanned, markedIgnored, skippedNoLead, skippedNotEligibleStage, skippedUpdatedConcurrently };
}

