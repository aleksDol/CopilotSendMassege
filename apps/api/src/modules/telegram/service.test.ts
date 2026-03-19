import test from "node:test";
import assert from "node:assert/strict";
import { getTelegramAccount, disconnectTelegram } from "./service.js";

function makeApp(overrides: Partial<any> = {}) {
  return {
    prisma: overrides.prisma
  };
}

test("getTelegramAccount scopes to createdByUserId", async () => {
  let receivedWhere: any | null = null;

  const app = makeApp({
    prisma: {
      telegramAccount: {
        findFirst: async (args: any) => {
          receivedWhere = args?.where ?? null;
          return null;
        }
      }
    }
  });

  await getTelegramAccount(app as any, { companyId: "c1", userId: "u1" });

  assert.ok(receivedWhere, "expected prisma.telegramAccount.findFirst to be called");
  assert.equal(receivedWhere.channelAccount.companyId, "c1");
  assert.equal(receivedWhere.channelAccount.createdByUserId, "u1");
});

test("disconnectTelegram only disconnects current user's telegram channel accounts", async () => {
  let receivedWhere: any | null = null;

  const app = makeApp({
    prisma: {
      channelAccount: {
        findMany: async (args: any) => {
          receivedWhere = args?.where ?? null;
          return [];
        }
      }
    }
  });

  await disconnectTelegram(app as any, { companyId: "c1", userId: "u1" });

  assert.ok(receivedWhere, "expected prisma.channelAccount.findMany to be called");
  assert.equal(receivedWhere.companyId, "c1");
  assert.equal(receivedWhere.createdByUserId, "u1");
});

