import test from "node:test";
import assert from "node:assert/strict";
import { listConversationMessages, sendConversationMessage } from "./service.js";

function makeApp(overrides: Partial<any> = {}) {
  return {
    prisma: overrides.prisma,
    config: { env: {} }
  };
}

test("listConversationMessages requires active telegram and scopes by channelAccountId", async () => {
  const calls: any[] = [];
  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-1" })
      },
      conversation: {
        findFirst: async (args: any) => {
          calls.push(args);
          return null;
        }
      }
    }
  });

  await assert.rejects(
    () =>
      listConversationMessages(app as any, {
        companyId: "c1",
        userId: "u1",
        conversationId: "conv-x",
        limit: 50
      }),
    (err: any) => err?.code === "CONVERSATION_NOT_FOUND"
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.channelAccountId, "ca-1");
});

test("sendConversationMessage scopes lookup by active channelAccountId", async () => {
  const calls: any[] = [];
  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-2" })
      },
      conversation: {
        findFirst: async (args: any) => {
          calls.push(args);
          return null;
        }
      }
    }
  });

  await assert.rejects(
    () =>
      sendConversationMessage(app as any, {
        companyId: "c1",
        userId: "u1",
        conversationId: "conv-y",
        text: "hi"
      }),
    (err: any) => err?.code === "CONVERSATION_NOT_FOUND"
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.channelAccountId, "ca-2");
});

