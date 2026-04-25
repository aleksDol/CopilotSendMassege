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

