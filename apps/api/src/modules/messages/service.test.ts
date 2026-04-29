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

test("sendConversationMessage fails when sendingEnabled is false", async () => {
  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-2" })
      },
      conversation: {
        findFirst: async () => ({
          id: "conv",
          channelAccountId: "ca-2",
          externalConversationId: "peer",
          channelAccount: {
            telegram: { id: "ta-1" },
            sendingEnabled: false
          }
        })
      }
    }
  });

  await assert.rejects(
    () =>
      sendConversationMessage(app as any, {
        companyId: "c1",
        userId: "u1",
        conversationId: "conv",
        text: "hi"
      }),
    (err: any) => err?.code === "TELEGRAM_SENDING_DISABLED"
  );
});

test("listConversationMessages uses explicit channelAccountId when provided", async () => {
  const calls: any[] = [];
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => ({ id: "ca-explicit", telegram: { id: "ta-explicit" } })
      },
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-fallback" })
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
        conversationId: "conv-z",
        limit: 50,
        channelAccountId: "ca-explicit"
      }),
    (err: any) => err?.code === "CONVERSATION_NOT_FOUND"
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0].where.channelAccountId, "ca-explicit");
});

test("sendConversationMessage with invalid explicit channelAccountId does not fallback and does not query conversation", async () => {
  let conversationLookups = 0;
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => null
      },
      telegramAccount: {
        findFirst: async () => ({ channelAccountId: "ca-fallback" })
      },
      conversation: {
        findFirst: async () => {
          conversationLookups += 1;
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
        text: "hi",
        channelAccountId: "ca-foreign"
      }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_FORBIDDEN"
  );

  assert.equal(conversationLookups, 0);
});
