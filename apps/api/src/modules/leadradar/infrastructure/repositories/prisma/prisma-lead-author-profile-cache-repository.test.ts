import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadAuthorProfileCacheRepository } from "./prisma-lead-author-profile-cache-repository.js";

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "cache1",
  telegramAccountId: "ta1",
  telegramUserId: "u1",
  username: "alice",
  displayName: "Alice",
  bio: null,
  linkedChannelId: null,
  linkedChannelUsername: null,
  linkedChannelTitle: null,
  linkedChannelDescription: null,
  rawProfileJson: null,
  fetchedAt: new Date("2026-04-24T00:00:00.000Z"),
  expiresAt: new Date("2026-05-08T00:00:00.000Z"),
  createdAt: new Date("2026-04-24T00:00:00.000Z"),
  updatedAt: new Date("2026-04-24T00:00:00.000Z"),
  ...overrides
});

test("upsertProfileCache upserts by telegramAccountId + telegramUserId", async () => {
  let upsertWhere: any = null;
  const repo = new PrismaLeadAuthorProfileCacheRepository({
    leadRadarAuthorProfileCache: {
      upsert: async ({ where, update }: any) => {
        upsertWhere = where;
        return row({ ...update });
      }
    }
  } as any);

  const out = await repo.upsertProfileCache({
    telegram_account_id: "ta1",
    telegram_user_id: "u1",
    username: "alice",
    fetched_at: new Date("2026-04-24T00:00:00.000Z"),
    expires_at: new Date("2026-05-01T00:00:00.000Z")
  });

  assert.deepEqual(upsertWhere, {
    telegramAccountId_telegramUserId: { telegramAccountId: "ta1", telegramUserId: "u1" }
  });
  assert.equal(out.telegram_account_id, "ta1");
  assert.equal(out.telegram_user_id, "u1");
});

test("findFreshByTelegramUserId returns only non-expired cache", async () => {
  const repo = new PrismaLeadAuthorProfileCacheRepository({
    leadRadarAuthorProfileCache: {
      findFirst: async ({ where }: any) => {
        const now = where.expiresAt.gt as Date;
        return now < new Date("2026-05-01T00:00:00.000Z") ? row() : null;
      }
    }
  } as any);

  const fresh = await repo.findFreshByTelegramUserId({
    telegram_account_id: "ta1",
    telegram_user_id: "u1",
    now: new Date("2026-04-25T00:00:00.000Z")
  });
  assert.ok(fresh);

  const expired = await repo.findFreshByTelegramUserId({
    telegram_account_id: "ta1",
    telegram_user_id: "u1",
    now: new Date("2026-05-10T00:00:00.000Z")
  });
  assert.equal(expired, null);
});

