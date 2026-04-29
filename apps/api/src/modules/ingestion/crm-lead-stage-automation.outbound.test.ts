import test from "node:test";
import assert from "node:assert/strict";
import { LeadSource, LeadStage, LeadStatus } from "@prisma/client";
import { ensureCrmLeadForOutbound } from "./crm-lead-stage-automation.js";

function makePrisma(overrides: Partial<any> = {}) {
  return {
    lead: {
      findUnique: async () => null,
      findFirst: async () => null,
      create: async () => null,
      ...(overrides.lead ?? {})
    },
    conversationState: {
      upsert: async () => ({}),
      ...(overrides.conversationState ?? {})
    }
  } as any;
}

test("outbound-first DIRECT -> creates Lead(status=OPEN, stage=CONTACTED) + syncs state", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      create: async (args: any) => {
        calls.push(["lead.create", args]);
        return { id: "l1", conversationId: args.data.conversationId };
      }
    },
    conversationState: {
      upsert: async (args: any) => {
        calls.push(["conversationState.upsert", args]);
        return {};
      }
    }
  });

  const lead = await ensureCrmLeadForOutbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    ownerUserId: "u1",
    conversationType: "DIRECT",
    peerExternalId: "peer1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: "self1"
  });

  assert.ok(lead);
  assert.equal(calls[0][0], "lead.create");
  assert.deepEqual(calls[0][1].data, {
    companyId: "co1",
    conversationId: "conv1",
    ownerUserId: "u1",
    source: LeadSource.TELEGRAM,
    status: LeadStatus.OPEN,
    stage: LeadStage.CONTACTED
  });
  assert.equal(calls[1][0], "conversationState.upsert");
  assert.deepEqual(calls[1][1].update, { leadStage: "CONTACTED" });
});

test("outbound second time -> no duplicate lead create", async () => {
  let created = 0;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", conversationId: "conv1" }),
      create: async () => {
        created += 1;
        return null;
      }
    }
  });

  await ensureCrmLeadForOutbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    conversationType: "DIRECT",
    peerExternalId: "peer1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: "self1"
  });

  assert.equal(created, 0);
});

test("existing lead -> no creation", async () => {
  let createCalled = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l1", conversationId: "conv1" }),
      create: async () => {
        createCalled = true;
        return null;
      }
    }
  });

  const lead = await ensureCrmLeadForOutbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    conversationType: "DIRECT",
    peerExternalId: "peer1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: "self1"
  });

  assert.ok(lead);
  assert.equal(createCalled, false);
});

test("bot/service/group/self dialogs are skipped conservatively", async () => {
  const prisma = makePrisma({
    lead: {
      create: async () => {
        throw new Error("should not create");
      }
    }
  });

  assert.equal(
    await ensureCrmLeadForOutbound(prisma, {
      companyId: "co1",
      conversationId: "conv1",
      conversationType: "GROUP",
      peerExternalId: "peer1",
      peerIsBot: false,
      isServiceDialog: false,
      senderExternalId: "self1"
    }),
    null
  );

  assert.equal(
    await ensureCrmLeadForOutbound(prisma, {
      companyId: "co1",
      conversationId: "conv1",
      conversationType: "DIRECT",
      peerExternalId: "peer1",
      peerIsBot: true,
      isServiceDialog: false,
      senderExternalId: "self1"
    }),
    null
  );

  assert.equal(
    await ensureCrmLeadForOutbound(prisma, {
      companyId: "co1",
      conversationId: "conv1",
      conversationType: "DIRECT",
      peerExternalId: "peer1",
      peerIsBot: false,
      isServiceDialog: true,
      senderExternalId: "self1"
    }),
    null
  );

  assert.equal(
    await ensureCrmLeadForOutbound(prisma, {
      companyId: "co1",
      conversationId: "conv1",
      conversationType: "DIRECT",
      peerExternalId: "same",
      peerIsBot: false,
      isServiceDialog: false,
      senderExternalId: "same"
    }),
    null
  );
});

test("P2002 race is handled by refetch", async () => {
  let createAttempts = 0;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => ({ id: "l-existing", conversationId: "conv1" }),
      findFirst: async () => null,
      create: async () => {
        createAttempts += 1;
        const err: any = new Error("Unique constraint failed");
        err.code = "P2002";
        throw err;
      }
    }
  });

  const lead = await ensureCrmLeadForOutbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    conversationType: "DIRECT",
    peerExternalId: "peer1",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: "self1"
  });

  assert.equal(createAttempts, 1);
  assert.ok(lead);
  assert.equal(lead.id, "l-existing");
});

test("outbound-first returns existing lead when same telegramUserId already exists in company", async () => {
  let created = false;
  const prisma = makePrisma({
    lead: {
      findUnique: async () => null,
      findFirst: async () => ({ id: "l-existing", conversationId: "conv-old" }),
      create: async () => {
        created = true;
        return null;
      }
    }
  });

  const lead = await ensureCrmLeadForOutbound(prisma, {
    companyId: "co1",
    conversationId: "conv-new",
    conversationType: "DIRECT",
    peerExternalId: "6516814090",
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: "self1"
  });

  assert.ok(lead);
  assert.equal(lead.id, "l-existing");
  assert.equal(created, false);
});
