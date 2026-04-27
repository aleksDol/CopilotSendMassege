import { LeadSource, LeadStage, LeadStatus, LeadRadarLeadStatus, MessageDirection, PrismaClient } from "@prisma/client";
import { syncLeadStageToConversationState } from "../modules/state/lead-stage-sync.js";

type Options = {
  apply: boolean;
  companyId?: string;
};

type ReportRow = {
  leadRadarLeadId: string;
  telegramAccountId: string;
  username: string | null;
  telegramUserId: string | null;
  matchedConversationId: string | null;
  matchedConversationType: string | null;
  hasCrmLead: boolean;
  action: "skipped_no_conversation" | "skipped_non_direct" | "skipped_no_messages" | "skipped_missing_identity" | "noop_has_crm" | "created";
};

export function canCreateCrmLeadFromMatchedConversation(params: {
  conversationType: "DIRECT" | "GROUP" | "CHANNEL";
  hasAnyMessages: boolean;
}): boolean {
  if (params.conversationType !== "DIRECT") return false;
  if (!params.hasAnyMessages) return false;
  return true;
}

function parseArgs(argv: string[]): Options {
  const opts: Options = { apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--apply") {
      opts.apply = true;
      continue;
    }
    if (arg === "--company-id") {
      opts.companyId = argv[i + 1];
      i += 1;
      continue;
    }
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    console.log(
      `[reconcile-leadradar-contacted] mode=${opts.apply ? "APPLY" : "DRY-RUN"} companyId=${opts.companyId ?? "ALL"}`
    );

    const contacted = await prisma.leadRadarLead.findMany({
      where: {
        status: LeadRadarLeadStatus.contacted,
        ...(opts.companyId ? { user: { companyId: opts.companyId } } : {})
      },
      select: {
        id: true,
        telegramAccountId: true,
        username: true,
        telegramUserId: true
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });

    let matchedConversationCount = 0;
    let createdCount = 0;
    let skippedNoConversation = 0;
    let skippedNonDirect = 0;
    let skippedNoMessages = 0;
    let skippedMissingIdentity = 0;
    let noopHasCrm = 0;

    console.log(`[reconcile-leadradar-contacted] scanned=${contacted.length}`);

    const report: ReportRow[] = [];

    for (const lead of contacted) {
      const rowBase = {
        leadRadarLeadId: lead.id,
        telegramAccountId: lead.telegramAccountId,
        username: lead.username ?? null,
        telegramUserId: lead.telegramUserId ?? null
      };

      if (!lead.telegramUserId?.trim()) {
        skippedMissingIdentity += 1;
        report.push({
          ...rowBase,
          matchedConversationId: null,
          matchedConversationType: null,
          hasCrmLead: false,
          action: "skipped_missing_identity"
        });
        continue;
      }

      const telegramAccount = await prisma.telegramAccount.findUnique({
        where: { id: lead.telegramAccountId },
        select: { channelAccountId: true }
      });

      if (!telegramAccount?.channelAccountId) {
        skippedNoConversation += 1;
        report.push({
          ...rowBase,
          matchedConversationId: null,
          matchedConversationType: null,
          hasCrmLead: false,
          action: "skipped_no_conversation"
        });
        continue;
      }

      const participant = await prisma.participant.findUnique({
        where: {
          channelAccountId_externalParticipantId: {
            channelAccountId: telegramAccount.channelAccountId,
            externalParticipantId: lead.telegramUserId
          }
        },
        select: { id: true }
      });

      if (!participant) {
        skippedNoConversation += 1;
        report.push({
          ...rowBase,
          matchedConversationId: null,
          matchedConversationType: null,
          hasCrmLead: false,
          action: "skipped_no_conversation"
        });
        continue;
      }

      const conversationParticipant = await prisma.conversationParticipant.findFirst({
        where: {
          participantId: participant.id,
          conversation: {
            channelAccountId: telegramAccount.channelAccountId,
            conversationType: "DIRECT"
          }
        },
        orderBy: { joinedAt: "desc" },
        select: {
          conversation: { select: { id: true, conversationType: true } }
        }
      });

      if (!conversationParticipant?.conversation?.id) {
        skippedNoConversation += 1;
        report.push({
          ...rowBase,
          matchedConversationId: null,
          matchedConversationType: null,
          hasCrmLead: false,
          action: "skipped_no_conversation"
        });
        continue;
      }

      matchedConversationCount += 1;
      const conversationId = conversationParticipant.conversation.id;
      const conversationType = conversationParticipant.conversation.conversationType;

      const hasAnyMessages = Boolean(
        await prisma.message.findFirst({
          where: { conversationId },
          select: { id: true }
        })
      );

      const existingCrmLead = await prisma.lead.findUnique({
        where: { conversationId },
        select: { id: true }
      });

      if (existingCrmLead) {
        noopHasCrm += 1;
        report.push({
          ...rowBase,
          matchedConversationId: conversationId,
          matchedConversationType: conversationType,
          hasCrmLead: true,
          action: "noop_has_crm"
        });
        continue;
      }

      if (conversationType !== "DIRECT") {
        skippedNonDirect += 1;
        report.push({
          ...rowBase,
          matchedConversationId: conversationId,
          matchedConversationType: conversationType,
          hasCrmLead: false,
          action: "skipped_non_direct"
        });
        continue;
      }

      if (!hasAnyMessages) {
        skippedNoMessages += 1;
        report.push({
          ...rowBase,
          matchedConversationId: conversationId,
          matchedConversationType: conversationType,
          hasCrmLead: false,
          action: "skipped_no_messages"
        });
        continue;
      }

      if (!opts.apply) {
        report.push({
          ...rowBase,
          matchedConversationId: conversationId,
          matchedConversationType: conversationType,
          hasCrmLead: false,
          action: "created"
        });
        continue;
      }

      // Apply: create CRM lead safely (no username usage).
      const channel = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { companyId: true, channelAccount: { select: { createdByUserId: true } } }
      });
      if (!channel) {
        skippedNoConversation += 1;
        report.push({
          ...rowBase,
          matchedConversationId: null,
          matchedConversationType: null,
          hasCrmLead: false,
          action: "skipped_no_conversation"
        });
        continue;
      }

      const created = await prisma.lead.create({
        data: {
          companyId: channel.companyId,
          conversationId,
          ownerUserId: channel.channelAccount.createdByUserId ?? null,
          source: LeadSource.TELEGRAM,
          status: LeadStatus.OPEN,
          stage: LeadStage.CONTACTED
        }
      });

      await syncLeadStageToConversationState(prisma, { conversationId, stage: LeadStage.CONTACTED });

      createdCount += 1;
      report.push({
        ...rowBase,
        matchedConversationId: conversationId,
        matchedConversationType: conversationType,
        hasCrmLead: true,
        action: "created"
      });

      // Optional: try to align with actual outbound message existence (informational only)
      void prisma.message.findFirst({
        where: { conversationId, direction: MessageDirection.OUTBOUND },
        select: { id: true }
      }).catch(() => undefined);
      void created;
    }

    // Print report (truncate)
    console.log(
      `[reconcile-leadradar-contacted] matched_conversations=${matchedConversationCount} created=${createdCount} noop_has_crm=${noopHasCrm} skipped_missing_identity=${skippedMissingIdentity} skipped_no_conversation=${skippedNoConversation} skipped_no_messages=${skippedNoMessages} skipped_non_direct=${skippedNonDirect}`
    );

    for (const r of report.slice(0, 500)) {
      console.log(
        `- leadRadarLeadId=${r.leadRadarLeadId} tgAccountId=${r.telegramAccountId} tgUserId=${r.telegramUserId ?? ""} username=${JSON.stringify(
          r.username ?? ""
        )} conversationId=${r.matchedConversationId ?? ""} crm=${r.hasCrmLead} action=${r.action}`
      );
    }
    if (report.length > 500) {
      console.log(`[reconcile-leadradar-contacted] output_truncated shown=500 total=${report.length}`);
    }

    if (!opts.apply) {
      console.log("[reconcile-leadradar-contacted] DRY-RUN: no CRM leads created. Re-run with --apply to create eligible leads.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("reconcile-leadradar-contacted")) {
  void main();
}

