import test from "node:test";
import assert from "node:assert/strict";
import { resolveLeadRadarSendingChannelAccount } from "./sending-account-resolver.js";

test("uses explicitly selected sending account when it is allowed", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-send",
        status: "CONNECTED",
        sendingEnabled: true,
        telegram: { id: "ta-send" }
      })
    }
  };

  const channelAccountId = await resolveLeadRadarSendingChannelAccount(prisma, {
    companyId: "company-1",
    leadTelegramAccountId: "ta-parser",
    preferredChannelAccountId: "ca-send"
  });

  assert.equal(channelAccountId, "ca-send");
});

test("rejects explicitly selected sending account from another company", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => null
    }
  };

  await assert.rejects(
    resolveLeadRadarSendingChannelAccount(prisma, {
      companyId: "company-1",
      leadTelegramAccountId: "ta-parser",
      preferredChannelAccountId: "ca-foreign"
    }),
    (error: any) => error?.code === "CHANNEL_ACCOUNT_FORBIDDEN"
  );
});

test("rejects explicitly selected sending account when sending is disabled", async () => {
  const prisma: any = {
    channelAccount: {
      findFirst: async () => ({
        id: "ca-send",
        status: "CONNECTED",
        sendingEnabled: false,
        telegram: { id: "ta-send" }
      })
    }
  };

  await assert.rejects(
    resolveLeadRadarSendingChannelAccount(prisma, {
      companyId: "company-1",
      leadTelegramAccountId: "ta-parser",
      preferredChannelAccountId: "ca-send"
    }),
    (error: any) => error?.code === "TELEGRAM_SENDING_DISABLED"
  );
});

test("falls back to parsing account channel when selected account is not provided", async () => {
  const prisma: any = {
    telegramAccount: {
      findUnique: async () => ({
        id: "ta-parser",
        channelAccount: {
          id: "ca-parser",
          companyId: "company-1",
          status: "CONNECTED",
          sendingEnabled: true,
          telegram: { id: "ta-parser" }
        }
      })
    }
  };

  const channelAccountId = await resolveLeadRadarSendingChannelAccount(prisma, {
    companyId: "company-1",
    leadTelegramAccountId: "ta-parser"
  });

  assert.equal(channelAccountId, "ca-parser");
});
