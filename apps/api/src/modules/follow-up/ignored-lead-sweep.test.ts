import test from "node:test";
import assert from "node:assert/strict";
import { markContactedLeadsIgnored } from "./ignored-lead-sweep.js";

function makePrisma(overrides: Partial<any> = {}) {
  return {
    conversationState: {
      findMany: async () => [],
      upsert: async () => ({}),
      ...(overrides.conversationState ?? {})
    },
    lead: {
      updateMany: async () => ({ count: 0 }),
      ...(overrides.lead ?? {})
    }
  } as any;
}

test("CONTACTED + lastOutboundAt older than threshold + no inbound after outbound -> IGNORED + state sync", async () => {
  const now = new Date("2026-01-02T00:00:00.000Z");
  const lastOutboundAt = new Date("2026-01-01T00:00:00.000Z"); // 24h
  const calls: any[] = [];

  const prisma = makePrisma({
    conversationState: {
      findMany: async () => [
        {
          lastOutboundAt,
          lastInboundAt: null,
          conversation: { id: "conv1", lead: { id: "lead1", stage: "CONTACTED", status: "OPEN" } }
        }
      ],
      upsert: async (args: any) => {
        calls.push(["conversationState.upsert", args]);
        return {};
      }
    },
    lead: {
      updateMany: async (args: any) => {
        calls.push(["lead.updateMany", args]);
        return { count: 1 };
      }
    }
  });

  const result = await markContactedLeadsIgnored(prisma, {
    now,
    unansweredHours: 24,
    logger: { info: () => {}, warn: () => {} }
  });

  assert.equal(result.markedIgnored, 1);
  assert.equal(calls[0][0], "lead.updateMany");
  assert.equal(calls[1][0], "conversationState.upsert");
  assert.deepEqual(calls[1][1].update, { leadStage: "IGNORED" });
});

test("CONTACTED + inbound after outbound -> stays CONTACTED (no update)", async () => {
  const now = new Date("2026-01-03T00:00:00.000Z");
  const prisma = makePrisma({
    conversationState: {
      findMany: async () => [
        {
          lastOutboundAt: new Date("2026-01-01T00:00:00.000Z"),
          lastInboundAt: new Date("2026-01-02T00:00:00.000Z"),
          conversation: { id: "conv1", lead: { id: "lead1", stage: "CONTACTED", status: "OPEN" } }
        }
      ]
    },
    lead: {
      updateMany: async () => ({ count: 1 })
    }
  });

  const res = await markContactedLeadsIgnored(prisma, {
    now,
    unansweredHours: 24,
    logger: { info: () => {}, warn: () => {} }
  });

  assert.equal(res.markedIgnored, 0);
});

test("CONTACTED + lastOutboundAt too recent -> not selected, no updates", async () => {
  const now = new Date("2026-01-02T00:00:00.000Z");
  const calls: any[] = [];
  const prisma = makePrisma({
    conversationState: {
      findMany: async (args: any) => {
        calls.push(["conversationState.findMany", args]);
        return [];
      }
    }
  });

  const res = await markContactedLeadsIgnored(prisma, {
    now,
    unansweredHours: 24,
    logger: { info: () => {}, warn: () => {} }
  });

  assert.equal(res.markedIgnored, 0);
  assert.equal(calls[0][0], "conversationState.findMany");
  assert.ok(calls[0][1].where.lastOutboundAt.lte instanceof Date);
});

test("Advanced/terminal stages not changed because query requires Lead.stage=CONTACTED", async () => {
  const now = new Date("2026-01-03T00:00:00.000Z");
  const calls: any[] = [];
  const prisma = makePrisma({
    conversationState: {
      findMany: async () => [
        {
          lastOutboundAt: new Date("2026-01-01T00:00:00.000Z"),
          lastInboundAt: null,
          conversation: { id: "conv1", lead: { id: "lead1", stage: "QUALIFIED", status: "OPEN" } }
        }
      ]
    },
    lead: {
      updateMany: async (args: any) => {
        calls.push(["lead.updateMany", args]);
        return { count: 1 };
      }
    }
  });

  const res = await markContactedLeadsIgnored(prisma, {
    now,
    unansweredHours: 24,
    logger: { info: () => {}, warn: () => {} }
  });

  assert.equal(res.markedIgnored, 0);
  assert.equal(calls.length, 0);
});

test("WON/LOST status not changed even if stage CONTACTED", async () => {
  const now = new Date("2026-01-03T00:00:00.000Z");
  const calls: any[] = [];
  const prisma = makePrisma({
    conversationState: {
      findMany: async () => [
        {
          lastOutboundAt: new Date("2026-01-01T00:00:00.000Z"),
          lastInboundAt: null,
          conversation: { id: "conv1", lead: { id: "lead1", stage: "CONTACTED", status: "WON" } }
        }
      ]
    },
    lead: {
      updateMany: async (args: any) => {
        calls.push(["lead.updateMany", args]);
        return { count: 1 };
      }
    }
  });

  const res = await markContactedLeadsIgnored(prisma, {
    now,
    unansweredHours: 24,
    logger: { info: () => {}, warn: () => {} }
  });

  assert.equal(res.markedIgnored, 0);
  assert.equal(calls.length, 0);
});

