import { LeadSource, LeadStage, LeadStatus, MessageDirection, PrismaClient, type ConversationType } from "@prisma/client";
import { syncLeadStageToConversationState } from "../modules/state/lead-stage-sync.js";

type Options = {
  apply: boolean;
  companyId?: string;
};

export type BackfillCandidateRow = {
  conversationId: string;
  companyId: string;
  channelAccountId: string;
  externalConversationId: string;
  title: string | null;
  conversationType: ConversationType;
  outCount: number;
  lastOutboundAt: Date | null;
};

export function isEligibleForOutboundBackfill(params: {
  conversationType: ConversationType;
  hasOutboundMessages: boolean;
  hasExistingLead: boolean;
  externalConversationId: string | null;
  channelAccountId: string | null;
}): boolean {
  if (params.conversationType !== "DIRECT") return false;
  if (!params.hasOutboundMessages) return false;
  if (params.hasExistingLead) return false;
  if (!params.channelAccountId) return false;
  if (!params.externalConversationId?.trim()) return false;
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

function formatCandidate(row: BackfillCandidateRow): string {
  return [
    `conversationId=${row.conversationId}`,
    `externalConversationId=${row.externalConversationId}`,
    `companyId=${row.companyId}`,
    `channelAccountId=${row.channelAccountId}`,
    `type=${row.conversationType}`,
    `outCount=${row.outCount}`,
    `lastOutboundAt=${row.lastOutboundAt ? row.lastOutboundAt.toISOString() : ""}`,
    `title=${JSON.stringify(row.title ?? "")}`
  ].join(" ");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    console.log(
      `[backfill-crm-leads-from-outbound] mode=${opts.apply ? "APPLY" : "DRY-RUN"} companyId=${opts.companyId ?? "ALL"}`
    );

    const conversations = await prisma.conversation.findMany({
      where: {
        conversationType: "DIRECT",
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
        lead: { is: null },
        messages: { some: { direction: MessageDirection.OUTBOUND } }
      },
      select: {
        id: true,
        companyId: true,
        channelAccountId: true,
        externalConversationId: true,
        conversationType: true,
        title: true,
        state: { select: { lastOutboundAt: true } },
        channelAccount: { select: { createdByUserId: true } },
        _count: { select: { messages: { where: { direction: MessageDirection.OUTBOUND } } } }
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });

    const candidates: BackfillCandidateRow[] = conversations
      .map((c) => ({
        conversationId: c.id,
        companyId: c.companyId,
        channelAccountId: c.channelAccountId,
        externalConversationId: c.externalConversationId,
        title: c.title ?? null,
        conversationType: c.conversationType,
        outCount: c._count.messages,
        lastOutboundAt: c.state?.lastOutboundAt ?? null
      }))
      .filter((r) =>
        isEligibleForOutboundBackfill({
          conversationType: r.conversationType,
          hasOutboundMessages: r.outCount > 0,
          hasExistingLead: false,
          externalConversationId: r.externalConversationId,
          channelAccountId: r.channelAccountId
        })
      );

    console.log(`[backfill-crm-leads-from-outbound] candidates_found=${candidates.length}`);
    for (const row of candidates.slice(0, 500)) {
      console.log(`- ${formatCandidate(row)}`);
    }
    if (candidates.length > 500) {
      console.log(`[backfill-crm-leads-from-outbound] output_truncated shown=500 total=${candidates.length}`);
    }

    if (!opts.apply) {
      console.log(
        "[backfill-crm-leads-from-outbound] DRY-RUN: no CRM leads created. Re-run with --apply to create leads for these conversations."
      );
      return;
    }

    let created = 0;
    let skippedRace = 0;

    for (const c of conversations) {
      const eligible = isEligibleForOutboundBackfill({
        conversationType: c.conversationType,
        hasOutboundMessages: c._count.messages > 0,
        hasExistingLead: false,
        externalConversationId: c.externalConversationId,
        channelAccountId: c.channelAccountId
      });
      if (!eligible) continue;

      // Idempotency/race safety: Lead.conversationId is unique. If someone creates in parallel, we skip.
      try {
        await prisma.lead.create({
          data: {
            companyId: c.companyId,
            conversationId: c.id,
            ownerUserId: c.channelAccount.createdByUserId ?? null,
            source: LeadSource.TELEGRAM,
            status: LeadStatus.OPEN,
            stage: LeadStage.CONTACTED
          }
        });
        await syncLeadStageToConversationState(prisma, { conversationId: c.id, stage: LeadStage.CONTACTED });
        created += 1;
      } catch (err: unknown) {
        if (typeof err === "object" && err !== null && (err as any).code === "P2002") {
          skippedRace += 1;
          continue;
        }
        throw err;
      }
    }

    console.log(`[backfill-crm-leads-from-outbound] APPLY complete created=${created} skipped_race=${skippedRace}`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1]?.includes("backfill-crm-leads-from-outbound")) {
  void main();
}

