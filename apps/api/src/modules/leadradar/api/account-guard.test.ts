import test from "node:test";
import assert from "node:assert/strict";
import { resolveActiveLeadRadarTelegramAccount } from "./account-guard.js";

test("resolveActiveLeadRadarTelegramAccount returns account when parsing is enabled", async () => {
  let fallbackWhere: any | null = null;
  const prisma: any = {
    channelAccount: {
      count: async () => 1
    },
    telegramAccount: {
      findFirst: async (args: any) => {
        fallbackWhere = args.where;
        return { id: "ta-1", channelAccountId: "ca-1" };
      }
    }
  };

  const out = await resolveActiveLeadRadarTelegramAccount(prisma, { companyId: "c1", userId: "u1" });
  assert.deepEqual(out, { id: "ta-1", channelAccountId: "ca-1" });
  assert.equal(fallbackWhere.channelAccount.companyId, "c1");
  assert.equal(fallbackWhere.channelAccount.createdByUserId, undefined);
});

test("resolveActiveLeadRadarTelegramAccount returns null when no parsing-enabled account", async () => {
  const prisma: any = {
    channelAccount: {
      count: async () => 0
    },
    telegramAccount: {
      findFirst: async () => null
    }
  };

  const out = await resolveActiveLeadRadarTelegramAccount(prisma, { companyId: "c1", userId: "u1" });
  assert.equal(out, null);
});

test("resolveActiveLeadRadarTelegramAccount uses explicit valid channelAccountId", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-1",
        status: "ACTIVE",
        parsingEnabled: true,
        telegram: { id: "ta-1", loginStatus: "CONNECTED" }
      })
    }
  };

  const out = await resolveActiveLeadRadarTelegramAccount(prisma, {
    companyId: "c1",
    userId: "u1",
    channelAccountId: "ca-1"
  });
  assert.deepEqual(out, { id: "ta-1", channelAccountId: "ca-1" });
});

test("resolveActiveLeadRadarTelegramAccount throws for foreign explicit channelAccountId", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => null
    }
  };

  await assert.rejects(
    () =>
      resolveActiveLeadRadarTelegramAccount(prisma, {
        companyId: "c1",
        userId: "u1",
        channelAccountId: "foreign-ca"
      }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_FORBIDDEN"
  );
});

test("resolveActiveLeadRadarTelegramAccount throws when explicit account has parsing disabled", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-1",
        status: "ACTIVE",
        parsingEnabled: false,
        telegram: { id: "ta-1", loginStatus: "CONNECTED" }
      })
    }
  };

  await assert.rejects(
    () =>
      resolveActiveLeadRadarTelegramAccount(prisma, {
        companyId: "c1",
        userId: "u1",
        channelAccountId: "ca-1"
      }),
    (err: any) => err?.code === "TELEGRAM_PARSING_DISABLED"
  );
});

test("resolveActiveLeadRadarTelegramAccount emits warning when fallback is used in multi-account mode", async () => {
  let warned = false;
  const prisma: any = {
    channelAccount: {
      count: async () => 2
    },
    telegramAccount: {
      findFirst: async () => ({ id: "ta-1", channelAccountId: "ca-1" })
    }
  };

  await resolveActiveLeadRadarTelegramAccount(prisma, {
    companyId: "c1",
    userId: "u1",
    onFallbackMultiAccountWarning: () => {
      warned = true;
    }
  });
  assert.equal(warned, true);
});
