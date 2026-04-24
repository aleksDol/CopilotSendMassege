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

