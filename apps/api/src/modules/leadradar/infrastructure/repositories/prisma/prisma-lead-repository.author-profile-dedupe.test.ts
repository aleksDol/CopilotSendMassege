import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadRepository } from "./prisma-lead-repository.js";

test("findExistingAuthorProfileLead queries sourceType=author_profile (ignores message/manual leads)", async () => {
  const whereCalls: any[] = [];
  const repo = new PrismaLeadRepository({
    leadRadarLead: {
      findFirst: async ({ where }: any) => {
        whereCalls.push(where);
        return null;
      }
    }
  } as any);

  await repo.findExistingAuthorProfileLead({
    telegram_account_id: "ta1",
    telegram_user_id: "u1"
  });

  await repo.findExistingAuthorProfileLead({
    telegram_account_id: "ta1",
    username_normalized: "alice"
  });

  assert.equal(whereCalls.length, 2);
  assert.equal(whereCalls[0].sourceType, "author_profile");
  assert.equal(whereCalls[1].sourceType, "author_profile");
});

test("findCrmLeadByTelegramUserId queries by participant external id with isSelf=false and channel account scope", async () => {
  const repo = new PrismaLeadRepository({
    telegramAccount: {
      findUnique: async () => ({ channelAccountId: "ca-1" })
    },
    lead: {
      findFirst: async ({ where }: any) => {
        assert.equal(where.conversation.channelAccountId, "ca-1");
        assert.equal(
          where.conversation.participants.some.participant.externalParticipantId,
          "tg-user-1"
        );
        assert.equal(where.conversation.participants.some.participant.isSelf, false);
        return { id: "crm-lead-1" };
      }
    }
  } as any);

  const exists = await repo.findCrmLeadByTelegramUserId({
    telegram_account_id: "ta-1",
    telegram_user_id: "tg-user-1"
  });

  assert.equal(exists, true);
});

test("findCrmLeadByTelegramUserId does not use username and does not block when only self participant exists", async () => {
  const leadCalls: any[] = [];
  const repo = new PrismaLeadRepository({
    telegramAccount: {
      findUnique: async () => ({ channelAccountId: "ca-1" })
    },
    lead: {
      findFirst: async ({ where }: any) => {
        leadCalls.push(where);
        return null;
      }
    }
  } as any);

  const exists = await repo.findCrmLeadByTelegramUserId({
    telegram_account_id: "ta-1",
    telegram_user_id: "tg-self"
  });

  assert.equal(exists, false);
  assert.equal(leadCalls.length, 1);
  assert.equal(leadCalls[0].conversation.participants.some.participant.isSelf, false);
  assert.equal(
    typeof leadCalls[0].conversation.participants.some.participant.username,
    "undefined"
  );
});
