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
      findFirst: async () => null,
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
    ownerUserId: "u1",
    conversationType: "DIRECT",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
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
      findFirst: async () => null,
      create: async () => {
        createAttempts += 1;
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
    }
  });

  const lead = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    conversationType: "DIRECT",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });
  assert.equal(createAttempts, 1);
  assert.ok(lead);
  assert.equal(lead.id, "l-existing");
});

test("ensureCrmLeadForInbound does NOT create lead for GROUP/CHANNEL", async () => {
  let created = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      create: async () => {
        created = true;
        return null;
      }
    }
  });

  const g = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-g",
    conversationType: "GROUP",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });
  assert.equal(g, null);

  const c = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-c",
    conversationType: "CHANNEL",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });
  assert.equal(c, null);
  assert.equal(created, false);
});

test("ensureCrmLeadForInbound does NOT create lead for bot/service/self/system senders", async () => {
  let created = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      create: async () => {
        created = true;
        return null;
      }
    }
  });

  const bot = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-b",
    conversationType: "DIRECT",
    peerExternalId: "peer-1",
    peerIsBot: true,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });
  assert.equal(bot, null);

  const service = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-s",
    conversationType: "DIRECT",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: true,
    senderExternalId: null,
    senderType: "user"
  });
  assert.equal(service, null);

  const self = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-self",
    conversationType: "DIRECT",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "self"
  });
  assert.equal(self, null);

  const system = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-sys",
    conversationType: "DIRECT",
    peerExternalId: "peer-1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "system"
  });
  assert.equal(system, null);

  assert.equal(created, false);
});

test("ensureCrmLeadForInbound returns existing lead when same telegramUserId already exists in company", async () => {
  let created = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      findFirst: async () => ({ id: "existing-lead", conversationId: "conv-old" }),
      create: async () => {
        created = true;
        return null;
      }
    }
  });

  const lead = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-new",
    conversationType: "DIRECT",
    peerExternalId: "6516814090",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });

  assert.ok(lead);
  assert.equal(lead.id, "existing-lead");
  assert.equal(created, false);
});

test("ensureCrmLeadForInbound creates new lead for different telegramUserId (username is ignored)", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async (args: any) => {
        calls.push(args);
        return { id: "l-new", conversationId: args.data.conversationId, stage: args.data.stage };
      }
    },
    conversationState: {
      upsert: async () => ({})
    }
  });

  const lead = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-new",
    conversationType: "DIRECT",
    peerExternalId: "different-user-id",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });

  assert.ok(lead);
  assert.equal(calls.length, 1);
});

test("ensureCrmLeadForInbound keeps behavior when telegramUserId is missing", async () => {
  let created = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      findFirst: async () => ({ id: "should-not-be-used" }),
      create: async () => {
        created = true;
        return null;
      }
    }
  });

  const lead = await ensureCrmLeadForInbound(prisma, {
    companyId: "co1",
    conversationId: "conv-missing-peer",
    conversationType: "DIRECT",
    peerExternalId: null,
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: null,
    senderType: "user"
  });

  assert.equal(lead, null);
  assert.equal(created, false);
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

test("applyOutboundContactedStage does NOT downgrade REPLIED -> CONTACTED", async () => {
  let updated = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", stage: "REPLIED" }),
      update: async () => {
        updated = true;
        return null;
      }
    }
  });

  const res = await applyOutboundContactedStage(prisma, { conversationId: "conv1" });
  assert.ok(res);
  assert.equal(res.stage, "REPLIED");
  assert.equal(updated, false);
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
