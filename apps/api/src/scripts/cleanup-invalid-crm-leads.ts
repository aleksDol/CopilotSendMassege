import { PrismaClient, type ConversationType, type LeadStage, type LeadStatus } from "@prisma/client";

type Options = {
  apply: boolean;
  companyId?: string;
};

export type InvalidLeadRow = {
  leadId: string;
  conversationId: string;
  conversationTitle: string | null;
  conversationType: ConversationType;
  status: LeadStatus;
  stage: LeadStage;
  createdAt: Date;
};

export const INVALID_CONVERSATION_TYPES: ConversationType[] = ["GROUP", "CHANNEL"];

export function isInvalidCrmLeadConversationType(conversationType: ConversationType): boolean {
  return INVALID_CONVERSATION_TYPES.includes(conversationType);
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

function formatRow(row: InvalidLeadRow): string {
  return [
    `leadId=${row.leadId}`,
    `conversationId=${row.conversationId}`,
    `type=${row.conversationType}`,
    `status=${row.status}`,
    `stage=${row.stage}`,
    `createdAt=${row.createdAt.toISOString()}`,
    `title=${JSON.stringify(row.conversationTitle ?? "")}`
  ].join(" ");
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();

  try {
    console.log(
      `[cleanup-invalid-crm-leads] mode=${opts.apply ? "APPLY" : "DRY-RUN"} companyId=${opts.companyId ?? "ALL"}`
    );

    const candidates = await prisma.lead.findMany({
      where: {
        ...(opts.companyId ? { companyId: opts.companyId } : {}),
        conversation: { conversationType: { in: INVALID_CONVERSATION_TYPES } }
      },
      select: {
        id: true,
        conversationId: true,
        status: true,
        stage: true,
        createdAt: true,
        conversation: {
          select: {
            title: true,
            conversationType: true
          }
        }
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });

    const invalid: InvalidLeadRow[] = candidates.map((row) => ({
      leadId: row.id,
      conversationId: row.conversationId,
      conversationTitle: row.conversation.title ?? null,
      conversationType: row.conversation.conversationType,
      status: row.status,
      stage: row.stage,
      createdAt: row.createdAt
    }));

    console.log(`[cleanup-invalid-crm-leads] invalid_leads_found=${invalid.length}`);
    for (const row of invalid.slice(0, 500)) {
      console.log(`- ${formatRow(row)}`);
    }
    if (invalid.length > 500) {
      console.log(`[cleanup-invalid-crm-leads] output_truncated shown=500 total=${invalid.length}`);
    }

    if (!opts.apply) {
      console.log("[cleanup-invalid-crm-leads] DRY-RUN: no deletions performed. Re-run with --apply to delete these Lead rows.");
      return;
    }

    const ids = invalid.map((r) => r.leadId);
    const BATCH = 500;
    let deletedTotal = 0;

    for (let i = 0; i < ids.length; i += BATCH) {
      const batch = ids.slice(i, i + BATCH);
      if (batch.length === 0) continue;
      const res = await prisma.lead.deleteMany({ where: { id: { in: batch } } });
      deletedTotal += res.count;
      console.log(`[cleanup-invalid-crm-leads] deleted batch=${batch.length} deletedCount=${res.count}`);
    }

    console.log(`[cleanup-invalid-crm-leads] APPLY complete deleted=${deletedTotal} requested=${ids.length}`);
  } finally {
    await prisma.$disconnect();
  }
}

// Run only when executed as a script, not when imported in tests.
if (process.argv[1]?.includes("cleanup-invalid-crm-leads")) {
  void main();
}

