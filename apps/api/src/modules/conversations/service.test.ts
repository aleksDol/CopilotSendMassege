import test from "node:test";
import assert from "node:assert/strict";
import { listConversations, mapConversationStateRowToListItem } from "./service.js";

function makeApp(overrides: Partial<any> = {}) {
  return {
    prisma: overrides.prisma,
    log: { info: () => {}, warn: () => {}, error: () => {} },
    config: { env: {} }
  };
}

test("listConversations returns empty when telegram not connected (prevents leakage across accounts)", async () => {
  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async () => null
      }
    }
  });

  const result = await listConversations(app as any, {
    companyId: "c1",
    userId: "u1",
    limit: 20
  });

  assert.deepEqual(result, { items: [], nextCursor: null });
});

test("listConversations scopes to active channelAccountId in prisma query", async () => {
  let receivedWhere: any | null = null;
  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-9" })
      },
      conversationState: {
        findMany: async (args: any) => {
          receivedWhere = args?.where ?? null;
          return [];
        }
      }
    }
  });

  const result = await listConversations(app as any, {
    companyId: "c1",
    userId: "u1",
    limit: 20
  });

  assert.deepEqual(result, { items: [], nextCursor: null });
  assert.ok(receivedWhere, "expected conversationState.findMany to be called");
  assert.equal(receivedWhere.conversation.channelAccountId, "ca-9");
  assert.equal(receivedWhere.conversation.isArchived, false);
});

test("listConversations allows archived/all override through status filter", async () => {
  const receivedWheres: any[] = [];
  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-9" })
      },
      conversationState: {
        findMany: async (args: any) => {
          receivedWheres.push(args?.where ?? null);
          return [];
        }
      }
    }
  });

  await listConversations(app as any, {
    companyId: "c1",
    userId: "u1",
    limit: 20,
    status: "archived"
  });

  await listConversations(app as any, {
    companyId: "c1",
    userId: "u1",
    limit: 20,
    status: "all"
  });

  assert.equal(receivedWheres[0].conversation.isArchived, true);
  assert.equal("isArchived" in receivedWheres[1].conversation, false);
});

test("listConversations uses explicit channelAccountId when provided", async () => {
  let receivedWhere: any | null = null;
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => ({ id: "ca-explicit", telegram: { id: "ta-explicit" } })
      },
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-fallback" })
      },
      conversationState: {
        findMany: async (args: any) => {
          receivedWhere = args?.where ?? null;
          return [];
        }
      }
    }
  });

  await listConversations(app as any, {
    companyId: "c1",
    userId: "u1",
    limit: 20,
    channelAccountId: "ca-explicit"
  });

  assert.ok(receivedWhere);
  assert.equal(receivedWhere.conversation.channelAccountId, "ca-explicit");
});

test("listConversations with invalid explicit channelAccountId throws and does not fallback", async () => {
  let findManyCalls = 0;
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => null
      },
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-fallback" })
      },
      conversationState: {
        findMany: async () => {
          findManyCalls += 1;
          return [];
        }
      }
    }
  });

  await assert.rejects(
    () =>
      listConversations(app as any, {
        companyId: "c1",
        userId: "u1",
        limit: 20,
        channelAccountId: "ca-foreign"
      }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_FORBIDDEN"
  );

  assert.equal(findManyCalls, 0);
});

test("mapConversationStateRowToListItem lowercases new lead stages (replied/ignored)", () => {
  const baseRow: any = {
    conversationId: "c-1",
    lastMessagePreview: "hi",
    lastMessageAt: new Date("2026-01-01T00:00:00.000Z"),
    leadTemperature: "COLD",
    unansweredClientMessageCount: 0,
    isWaitingForReply: false,
    leadStage: "REPLIED",
    conversation: {
      title: null,
      assignedUserId: null,
      isArchived: false,
      channelAccount: { displayName: "Chat" }
    }
  };

  assert.equal(mapConversationStateRowToListItem(baseRow).leadStage, "replied");
  assert.equal(mapConversationStateRowToListItem({ ...baseRow, leadStage: "IGNORED" }).leadStage, "ignored");
});
