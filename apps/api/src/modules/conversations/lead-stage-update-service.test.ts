import test from "node:test";
import assert from "node:assert/strict";
import { LeadSource, LeadStage, LeadStatus } from "@prisma/client";
import { AppError } from "../../lib/errors.js";
import { updateConversationLeadStage } from "./lead-stage-update-service.js";

function makePrisma(overrides: Partial<any> = {}) {
  return {
    conversation: {
      findFirst: async () => null,
      ...(overrides.conversation ?? {})
    },
    lead: {
      findUnique: async () => null,
      create: async () => null,
      update: async () => null,
      ...(overrides.lead ?? {})
    },
    conversationState: {
      upsert: async () => ({}),
      ...(overrides.conversationState ?? {})
    },
    $transaction: async (fn: any) => fn({ ...(overrides.tx ?? overrides) })
  } as any;
}

test("stage NEW sets status NEW, clears wonAt/lostAt, syncs ConversationState.leadStage", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    conversation: {
      findFirst: async () => ({ id: "c1", companyId: "co1", channelAccount: { createdByUserId: "u1" } })
    },
    tx: {
      lead: {
        findUnique: async () => null,
        create: async (args: any) => {
          calls.push(["lead.create", args]);
          return { id: "l1", conversationId: "c1", status: "NEW", stage: "NEW", wonAt: null, lostAt: null };
        }
      },
      conversationState: {
        upsert: async (args: any) => {
          calls.push(["conversationState.upsert", args]);
          return {};
        }
      }
    }
  });

  const res = await updateConversationLeadStage(prisma, {
    companyId: "co1",
    conversationId: "c1",
    stage: LeadStage.NEW,
    now: new Date("2026-01-01T00:00:00.000Z")
  });

  assert.equal(res.status, "NEW");
  assert.equal(res.stage, "NEW");
  assert.equal(calls[0][0], "lead.create");
  assert.deepEqual(calls[0][1].data, {
    companyId: "co1",
    conversationId: "c1",
    ownerUserId: "u1",
    source: LeadSource.TELEGRAM,
    status: LeadStatus.NEW,
    stage: LeadStage.NEW,
    wonAt: null,
    lostAt: null
  });
  assert.equal(calls[1][0], "conversationState.upsert");
  assert.deepEqual(calls[1][1].update, { leadStage: "NEW" });
});

test("CONTACTED/REPLIED/IGNORED/QUALIFIED/PROPOSAL/NEGOTIATION map to status OPEN", async () => {
  for (const stage of [
    LeadStage.CONTACTED,
    LeadStage.REPLIED,
    LeadStage.IGNORED,
    LeadStage.QUALIFIED,
    LeadStage.PROPOSAL,
    LeadStage.NEGOTIATION
  ]) {
    const prisma = makePrisma({
      conversation: {
        findFirst: async () => ({ id: "c1", companyId: "co1", channelAccount: { createdByUserId: "u1" } })
      },
      tx: {
        lead: {
          findUnique: async () => ({ id: "l1", conversationId: "c1", status: "NEW", stage: "NEW", wonAt: null, lostAt: null }),
          update: async (args: any) => ({ id: "l1", conversationId: "c1", ...args.data })
        },
        conversationState: { upsert: async () => ({}) }
      }
    });

    const res = await updateConversationLeadStage(prisma, { companyId: "co1", conversationId: "c1", stage });
    assert.equal(res.status, "OPEN");
    assert.equal(res.stage, stage);
  }
});

test("WON sets status WON, stage WON, wonAt if empty, clears lostAt", async () => {
  const now = new Date("2026-01-05T00:00:00.000Z");
  const prisma = makePrisma({
    conversation: {
      findFirst: async () => ({ id: "c1", companyId: "co1", channelAccount: { createdByUserId: "u1" } })
    },
    tx: {
      lead: {
        findUnique: async () => ({ id: "l1", conversationId: "c1", status: "OPEN", stage: "CONTACTED", wonAt: null, lostAt: new Date("2026-01-01T00:00:00.000Z") }),
        update: async (args: any) => ({ id: "l1", conversationId: "c1", ...args.data })
      },
      conversationState: { upsert: async () => ({}) }
    }
  });

  const res = await updateConversationLeadStage(prisma, { companyId: "co1", conversationId: "c1", stage: LeadStage.WON, now });
  assert.equal(res.status, "WON");
  assert.equal(res.stage, "WON");
  assert.equal(res.wonAt?.toISOString(), now.toISOString());
  assert.equal(res.lostAt, null);
});

test("LOST sets status LOST, stage LOST, lostAt if empty, clears wonAt", async () => {
  const now = new Date("2026-01-05T00:00:00.000Z");
  const prisma = makePrisma({
    conversation: {
      findFirst: async () => ({ id: "c1", companyId: "co1", channelAccount: { createdByUserId: "u1" } })
    },
    tx: {
      lead: {
        findUnique: async () => ({ id: "l1", conversationId: "c1", status: "OPEN", stage: "CONTACTED", wonAt: new Date("2026-01-01T00:00:00.000Z"), lostAt: null }),
        update: async (args: any) => ({ id: "l1", conversationId: "c1", ...args.data })
      },
      conversationState: { upsert: async () => ({}) }
    }
  });

  const res = await updateConversationLeadStage(prisma, { companyId: "co1", conversationId: "c1", stage: LeadStage.LOST, now });
  assert.equal(res.status, "LOST");
  assert.equal(res.stage, "LOST");
  assert.equal(res.lostAt?.toISOString(), now.toISOString());
  assert.equal(res.wonAt, null);
});

test("moving from WON to CONTACTED clears wonAt/lostAt and sets status OPEN", async () => {
  const prisma = makePrisma({
    conversation: {
      findFirst: async () => ({ id: "c1", companyId: "co1", channelAccount: { createdByUserId: "u1" } })
    },
    tx: {
      lead: {
        findUnique: async () => ({ id: "l1", conversationId: "c1", status: "WON", stage: "WON", wonAt: new Date("2026-01-01T00:00:00.000Z"), lostAt: null }),
        update: async (args: any) => ({ id: "l1", conversationId: "c1", ...args.data })
      },
      conversationState: { upsert: async () => ({}) }
    }
  });

  const res = await updateConversationLeadStage(prisma, { companyId: "co1", conversationId: "c1", stage: LeadStage.CONTACTED });
  assert.equal(res.status, "OPEN");
  assert.equal(res.stage, "CONTACTED");
  assert.equal(res.wonAt, null);
  assert.equal(res.lostAt, null);
});

test("company scoping: cannot update another company's conversation", async () => {
  const prisma = makePrisma({
    conversation: {
      findFirst: async () => null
    }
  });

  await assert.rejects(
    () => updateConversationLeadStage(prisma, { companyId: "co1", conversationId: "other", stage: LeadStage.NEW }),
    (err: any) => err instanceof AppError && err.code === "CONVERSATION_NOT_FOUND"
  );
});

