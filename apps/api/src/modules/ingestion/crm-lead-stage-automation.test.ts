import test from "node:test";
import assert from "node:assert/strict";
import { LeadSource, LeadStage, LeadStatus } from "@prisma/client";
import {
  applyInboundRepliedStage,
  applyOutboundContactedStage,
  ensureCrmLeadForInbound
} from "./crm-lead-stage-automation.js";

function makePrisma(overrides: Partial<any> = {}) {
  return {
    lead: {
      findUnique: async () => null,
      create: async () => null,
      update: async () => null,
      ...(overrides.lead ?? {})
    },
    message: {
      findFirst: async () => null,
      ...(overrides.message ?? {})
    },
    conversationState: {
      upsert: async () => ({}),
      ...(overrides.conversationState ?? {})
    }
  } as any;
}

test("ensureCrmLeadForInbound creates NEW lead and syncs ConversationState.leadStage=NEW", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      create: async (args: any) => {
        calls.push(["lead.create", args]);
        return { id: "l1", conversationId: args.data.conversationId, stage: args.data.stage };
      }
    },
    conversationState: {
      upsert: async (args: any) => {
        calls.push(["conversationState.upsert", args]);
        return {};
      }
    }
  });

  const lead = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    ownerUserId: "u1"
  });

  assert.ok(lead, "expected lead to be created");
  assert.equal(lead.id, "l1");
  assert.deepEqual(calls[0][0], "lead.create");
  assert.deepEqual(calls[0][1].data, {
    companyId: "co1",
    conversationId: "conv1",
    ownerUserId: "u1",
    source: LeadSource.TELEGRAM,
    status: LeadStatus.NEW,
    stage: LeadStage.NEW
  });
  assert.equal(calls[1][0], "conversationState.upsert");
  assert.equal(calls[1][1].update.leadStage, "NEW");
});

test("ensureCrmLeadForInbound is idempotent on unique constraint race (P2002)", async () => {
  let createAttempts = 0;
  const prisma = makePrisma({
    lead: {
      findUnique: async (_args: any) => ({ id: "l-existing", conversationId: "conv1", stage: "NEW" }),
      create: async () => {
        createAttempts += 1;
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
    }
  });

  const lead = await ensureCrmLeadForInbound(prisma, { companyId: "co1", conversationId: "conv1" });
  assert.equal(createAttempts, 1);
  assert.ok(lead);
  assert.equal(lead.id, "l-existing");
});

test("applyOutboundContactedStage skips when lead missing", async () => {
  const prisma = makePrisma();
  const res = await applyOutboundContactedStage(prisma, { conversationId: "conv1" });
  assert.equal(res, null);
});

test("applyOutboundContactedStage updates NEW -> CONTACTED and syncs state", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", stage: "NEW" }),
      update: async (args: any) => {
        calls.push(["lead.update", args]);
        return { id: "l1", stage: args.data.stage };
      }
    },
    conversationState: {
      upsert: async (args: any) => {
        calls.push(["conversationState.upsert", args]);
        return {};
      }
    }
  });

  const updated = await applyOutboundContactedStage(prisma, { conversationId: "conv1" });
  assert.ok(updated);
  assert.equal(updated.stage, "CONTACTED");
  assert.equal(calls[0][0], "lead.update");
  assert.equal(calls[1][0], "conversationState.upsert");
  assert.equal(calls[1][1].update.leadStage, "CONTACTED");
});

test("applyInboundRepliedStage keeps NEW when no prior outbound exists", async () => {
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", stage: "NEW" })
    },
    message: {
      findFirst: async () => null
    }
  });

  const res = await applyInboundRepliedStage(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    inboundSentAt: new Date("2026-01-01T00:00:00.000Z"),
    priorLastOutboundAt: null
  });

  assert.ok(res);
  assert.equal(res.stage, "NEW");
});

test("applyInboundRepliedStage updates CONTACTED -> REPLIED when prior outbound exists", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", stage: "CONTACTED" }),
      update: async (args: any) => {
        calls.push(["lead.update", args]);
        return { id: "l1", stage: args.data.stage };
      }
    },
    conversationState: {
      upsert: async (args: any) => {
        calls.push(["conversationState.upsert", args]);
        return {};
      }
    },
    message: {
      findFirst: async () => ({ id: "m-out" })
    }
  });

  const res = await applyInboundRepliedStage(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    inboundSentAt: new Date("2026-01-01T00:00:00.000Z"),
    priorLastOutboundAt: null
  });

  assert.ok(res);
  assert.equal(res.stage, "REPLIED");
  assert.equal(calls[0][0], "lead.update");
  assert.equal(calls[1][0], "conversationState.upsert");
  assert.equal(calls[1][1].update.leadStage, "REPLIED");
});

test("applyInboundRepliedStage updates IGNORED -> REPLIED when prior outbound exists", async () => {
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", stage: "IGNORED" }),
      update: async (args: any) => ({ id: "l1", stage: args.data.stage })
    },
    conversationState: {
      upsert: async () => ({})
    },
    message: {
      findFirst: async () => ({ id: "m-out" })
    }
  });

  const res = await applyInboundRepliedStage(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    inboundSentAt: new Date("2026-01-01T00:00:00.000Z"),
    priorLastOutboundAt: null
  });
  assert.ok(res);
  assert.equal(res.stage, "REPLIED");
});

test("no downgrade: QUALIFIED/PROPOSAL/NEGOTIATION/WON/LOST never auto-change", async () => {
  for (const stage of ["QUALIFIED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const) {
    let updated = false;
    const prisma = makePrisma({
      lead: {
        findUnique: async () => ({ id: "l1", stage }),
        update: async () => {
          updated = true;
          return null;
        }
      }
    });

    await applyOutboundContactedStage(prisma, { conversationId: "conv1" });
    await applyInboundRepliedStage(prisma, {
      companyId: "co1",
      conversationId: "conv1",
      inboundSentAt: new Date(),
      priorLastOutboundAt: new Date(Date.now() - 1000)
    });

    assert.equal(updated, false, `stage ${stage} should not be updated`);
  }
});

