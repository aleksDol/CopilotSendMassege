import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadSettingsRepository } from "./prisma-lead-settings-repository.js";

const makeRow = (overrides: Record<string, unknown> = {}) => ({
  id: "s1",
  userId: "u1",
  telegramAccountId: "ta1",
  isEnabled: false,
  authorProfileMatchingEnabled: false,
  minScoreThreshold: 2,
  storeContextEnabled: true,
  contextBeforeCount: 3,
  contextAfterCount: 0,
  dedupeWindowHours: 72,
  coldFirstTouchPlaybook: null,
  createdAt: new Date("2026-04-24T00:00:00.000Z"),
  updatedAt: new Date("2026-04-24T00:00:00.000Z"),
  ...overrides
});

test("settings default authorProfileMatchingEnabled = false", async () => {
  let createData: any = null;
  const repo = new PrismaLeadSettingsRepository({
    leadRadarSettings: {
      upsert: async ({ create }: any) => {
        createData = create;
        return makeRow();
      }
    }
  } as any);

  const out = await repo.createDefaultIfNotExists({
    user_id: "u1",
    telegram_account_id: "ta1"
  });

  assert.equal(createData.authorProfileMatchingEnabled, false);
  assert.equal(out.author_profile_matching_enabled, false);
});

test("settings update persists authorProfileMatchingEnabled true/false", async () => {
  const updates: any[] = [];
  const repo = new PrismaLeadSettingsRepository({
    leadRadarSettings: {
      upsert: async () => makeRow(),
      update: async ({ data }: any) => {
        updates.push(data);
        return makeRow({
          authorProfileMatchingEnabled: Boolean(data.authorProfileMatchingEnabled)
        });
      }
    }
  } as any);

  const outTrue = await repo.updateSettings({
    user_id: "u1",
    telegram_account_id: "ta1",
    patch: { author_profile_matching_enabled: true }
  });
  const outFalse = await repo.updateSettings({
    user_id: "u1",
    telegram_account_id: "ta1",
    patch: { author_profile_matching_enabled: false }
  });

  assert.equal(updates[0]?.authorProfileMatchingEnabled, true);
  assert.equal(updates[1]?.authorProfileMatchingEnabled, false);
  assert.equal(outTrue.author_profile_matching_enabled, true);
  assert.equal(outFalse.author_profile_matching_enabled, false);
});

