import test from "node:test";
import assert from "node:assert/strict";
import { resolveTelegramAccountForRequest } from "./telegram-account-resolver.js";

test("resolveTelegramAccountForRequest returns explicitly selected account when valid", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-explicit",
        telegram: { id: "ta-explicit" }
      })
    },
    telegramAccount: {
      findFirst: async () => null
    }
  };

  const resolved = await resolveTelegramAccountForRequest(prisma, {
    companyId: "c1",
    userId: "u1",
    channelAccountId: "ca-explicit"
  });

  assert.deepEqual(resolved, { telegramAccountId: "ta-explicit", channelAccountId: "ca-explicit" });
});

test("resolveTelegramAccountForRequest rejects foreign explicit channelAccountId and does not fallback", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => null
    },
    telegramAccount: {
      findFirst: async () => ({ id: "ta-fallback", channelAccountId: "ca-fallback" })
    }
  };

  await assert.rejects(
    () =>
      resolveTelegramAccountForRequest(prisma, {
        companyId: "c1",
        userId: "u1",
        channelAccountId: "ca-foreign"
      }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_FORBIDDEN"
  );
});

test("resolveTelegramAccountForRequest falls back to latest when channelAccountId is not provided", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => null
    },
    telegramAccount: {
      findFirst: async () => ({ id: "ta-1", channelAccountId: "ca-1" })
    }
  };

  const resolved = await resolveTelegramAccountForRequest(prisma, {
    companyId: "c1",
    userId: "u1"
  });

  assert.deepEqual(resolved, { telegramAccountId: "ta-1", channelAccountId: "ca-1" });
});

test("resolveTelegramAccountForRequest rejects explicit disconnected account", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-explicit",
        status: "DISCONNECTED",
        telegram: { id: "ta-explicit" }
      })
    },
    telegramAccount: {
      findFirst: async () => ({ id: "ta-fallback", channelAccountId: "ca-fallback" })
    }
  };

  await assert.rejects(
    () =>
      resolveTelegramAccountForRequest(prisma, {
        companyId: "c1",
        userId: "u1",
        channelAccountId: "ca-explicit"
      }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_NOT_AVAILABLE"
  );
});

test("resolveTelegramAccountForRequest rejects explicit account without TelegramAccount", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-explicit",
        status: "ACTIVE",
        telegram: null
      })
    },
    telegramAccount: {
      findFirst: async () => ({ id: "ta-fallback", channelAccountId: "ca-fallback" })
    }
  };

  await assert.rejects(
    () =>
      resolveTelegramAccountForRequest(prisma, {
        companyId: "c1",
        userId: "u1",
        channelAccountId: "ca-explicit"
      }),
    (err: any) => err?.code === "TELEGRAM_ACCOUNT_NOT_AVAILABLE"
  );
});
