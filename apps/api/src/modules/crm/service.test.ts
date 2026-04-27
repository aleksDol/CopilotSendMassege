import test from "node:test";
import assert from "node:assert/strict";
import { listCrmLeads } from "./service.js";

function makeApp(overrides: Partial<any> = {}) {
  return {
    prisma: {
      lead: {
        findMany: async () => [],
        ...(overrides.prisma?.lead ?? {})
      }
    }
  } as any;
}

test("listCrmLeads scopes by companyId and supports stage filter", async () => {
  let receivedArgs: any | null = null;
  const app = makeApp({
    prisma: {
      lead: {
        findMany: async (args: any) => {
          receivedArgs = args;
          return [];
        }
      }
    }
  });

  await listCrmLeads(app, { companyId: "c1", limit: 20, stage: "CONTACTED" as any });

  assert.ok(receivedArgs);
  assert.equal(receivedArgs.where.companyId, "c1");
  assert.equal(receivedArgs.where.stage, "CONTACTED");
  assert.ok(receivedArgs.take >= 21);
});

test("listCrmLeads supports search by conversation title or externalConversationId", async () => {
  let receivedWhere: any | null = null;
  const app = makeApp({
    prisma: {
      lead: {
        findMany: async (args: any) => {
          receivedWhere = args.where;
          return [];
        }
      }
    }
  });

  await listCrmLeads(app, { companyId: "c1", limit: 50, search: "ivan" });

  assert.ok(receivedWhere);
  assert.equal(receivedWhere.companyId, "c1");
  assert.ok(receivedWhere.conversation);
  assert.ok(Array.isArray(receivedWhere.conversation.OR));
  assert.equal(receivedWhere.conversation.OR.length, 2);
});

test("listCrmLeads orders by lastMessageAt desc, then updatedAt desc", async () => {
  let receivedOrderBy: any | null = null;
  const app = makeApp({
    prisma: {
      lead: {
        findMany: async (args: any) => {
          receivedOrderBy = args.orderBy;
          return [];
        }
      }
    }
  });

  await listCrmLeads(app, { companyId: "c1", limit: 10 });

  assert.ok(receivedOrderBy);
  assert.deepEqual(receivedOrderBy[0], { conversation: { state: { lastMessageAt: "desc" } } });
  assert.deepEqual(receivedOrderBy[1], { updatedAt: "desc" });
});

test("listCrmLeads maps missing ConversationState safely", async () => {
  const app = makeApp({
    prisma: {
      lead: {
        findMany: async () => [
          {
            id: "l1",
            conversationId: "conv1",
            source: "TELEGRAM",
            status: "OPEN",
            stage: "NEW",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            conversation: {
              title: null,
              externalConversationId: "ivan",
              conversationType: "DIRECT",
              state: null,
              participants: [{ participant: { externalParticipantId: "p1", isSelf: false } }]
            }
          }
        ]
      }
    }
  });

  const res = await listCrmLeads(app, { companyId: "c1", limit: 50 });
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].clientName, "ivan");
  assert.equal(res.items[0].lastMessageAt, null);
});

test("listCrmLeads dedupes DIRECT leads by peer externalParticipantId (isSelf=false)", async () => {
  const app = makeApp({
    prisma: {
      lead: {
        findMany: async () => [
          {
            id: "l1",
            conversationId: "conv_numeric",
            source: "TELEGRAM",
            status: "OPEN",
            stage: "CONTACTED",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-03T00:00:00.000Z"),
            conversation: {
              title: "Yan",
              externalConversationId: "6516814090",
              conversationType: "DIRECT",
              state: { lastMessageAt: new Date("2026-01-03T00:00:00.000Z"), lastInboundAt: null, lastOutboundAt: null },
              participants: [{ participant: { externalParticipantId: "6516814090", isSelf: false } }]
            }
          },
          {
            id: "l2",
            conversationId: "conv_username",
            source: "TELEGRAM",
            status: "OPEN",
            stage: "CONTACTED",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            updatedAt: new Date("2026-01-02T00:00:00.000Z"),
            conversation: {
              title: "Yan",
              externalConversationId: "Yan_adver",
              conversationType: "DIRECT",
              state: { lastMessageAt: new Date("2026-01-02T00:00:00.000Z"), lastInboundAt: null, lastOutboundAt: null },
              participants: [{ participant: { externalParticipantId: "6516814090", isSelf: false } }]
            }
          }
        ]
      }
    }
  });

  const res = await listCrmLeads(app, { companyId: "c1", limit: 50 });
  assert.equal(res.items.length, 1);
  assert.equal(res.items[0].leadId, "l1");
});

