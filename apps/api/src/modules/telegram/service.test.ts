import test from "node:test";
import assert from "node:assert/strict";
import { getTelegramAccount, disconnectTelegram, patchTelegramAccountFlags, triggerInitialSync } from "./service.js";
import { TelegramWorkerClient } from "../../lib/telegram-worker-client.js";

function makeApp(overrides: Partial<any> = {}) {
  return {
    prisma: overrides.prisma,
    log: { warn: () => {}, ...(overrides as any).log },
    config: { env: {}, ...(overrides as any).config }
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

test("patchTelegramAccountFlags forbids disabling both sending and parsing", async () => {
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => ({
          id: "ca-1",
          sendingEnabled: true,
          parsingEnabled: true,
          telegram: { id: "ta-1" }
        })
      }
    }
  });

  await assert.rejects(
    () =>
      patchTelegramAccountFlags(app as any, { companyId: "c1", userId: "u1" }, {
        channelAccountId: "ca-1",
        sendingEnabled: false,
        parsingEnabled: false
      }),
    (err: any) => err?.code === "INVALID_TELEGRAM_ACCOUNT_FLAGS"
  );
});

test("patchTelegramAccountFlags updates single flag and keeps other as-is", async () => {
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => ({
          id: "ca-1",
          sendingEnabled: true,
          parsingEnabled: true,
          telegram: { id: "ta-1" }
        }),
        update: async () => ({
          id: "ca-1",
          sendingEnabled: false,
          parsingEnabled: true
        })
      }
    }
  });

  const updated = await patchTelegramAccountFlags(
    app as any,
    { companyId: "c1", userId: "u1" },
    { channelAccountId: "ca-1", sendingEnabled: false }
  );

  assert.equal(updated.channelAccountId, "ca-1");
  assert.equal(updated.sendingEnabled, false);
  assert.equal(updated.parsingEnabled, true);
});

test("triggerInitialSync uses explicit valid channelAccountId", async () => {
  const syncCalls: any[] = [];
  const originalSync = (TelegramWorkerClient as any).prototype.sync;
  (TelegramWorkerClient as any).prototype.sync = async (payload: any) => {
    syncCalls.push(payload);
    return { status: "ok" };
  };

  try {
    const app = makeApp({
      prisma: {
        channelAccount: {
          findFirst: async () => ({ id: "ca-explicit", status: "ACTIVE", telegram: { id: "ta-explicit" } })
        },
        telegramAccount: {
          findFirst: async (args: any) => ({
            id: "ta-explicit",
            channelAccountId: args.where.id ?? "ca-explicit",
            phone: "+10000000000",
            channelAccount: { id: "ca-explicit" }
          })
        }
      },
      config: {
        env: {
          TELEGRAM_WORKER_URL: "http://worker.local",
          INTERNAL_API_TOKEN: "token",
          TELEGRAM_WORKER_TIMEOUT_MS: 1000
        }
      }
    });

    await triggerInitialSync(app as any, { companyId: "c1", userId: "u1" }, { channelAccountId: "ca-explicit" });
    assert.equal(syncCalls.length, 1);
    assert.equal(syncCalls[0].channelAccountId, "ca-explicit");
  } finally {
    (TelegramWorkerClient as any).prototype.sync = originalSync;
  }
});

test("triggerInitialSync rejects invalid explicit channelAccountId", async () => {
  const app = makeApp({
    prisma: {
      channelAccount: {
        findFirst: async () => null
      },
      telegramAccount: {
        findFirst: async () => ({ id: "ta-fallback", channelAccountId: "ca-fallback" })
      }
    }
  });

  await assert.rejects(
    () =>
      triggerInitialSync(app as any, { companyId: "c1", userId: "u1" }, { channelAccountId: "ca-foreign" }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_FORBIDDEN"
  );
});

test("triggerInitialSync fallback without channelAccountId logs warning in multi-account environment", async () => {
  const syncCalls: any[] = [];
  const warnings: string[] = [];
  const originalSync = (TelegramWorkerClient as any).prototype.sync;
  (TelegramWorkerClient as any).prototype.sync = async (payload: any) => {
    syncCalls.push(payload);
    return { status: "ok" };
  };

  try {
    const app = makeApp({
      prisma: {
        telegramAccount: {
          count: async () => 2,
          findFirst: async () => ({
            id: "ta-fallback",
            channelAccountId: "ca-fallback",
            phone: "+10000000000",
            channelAccount: { id: "ca-fallback" }
          })
        }
      },
      log: {
        warn: (msg: string) => warnings.push(msg)
      },
      config: {
        env: {
          TELEGRAM_WORKER_URL: "http://worker.local",
          INTERNAL_API_TOKEN: "token",
          TELEGRAM_WORKER_TIMEOUT_MS: 1000
        }
      }
    });

    await triggerInitialSync(app as any, { companyId: "c1", userId: "u1" }, {});
    assert.equal(syncCalls.length, 1);
    assert.ok(warnings.some((w) => w.includes("triggerInitialSync called without channelAccountId in multi-account environment")));
  } finally {
    (TelegramWorkerClient as any).prototype.sync = originalSync;
  }
});
