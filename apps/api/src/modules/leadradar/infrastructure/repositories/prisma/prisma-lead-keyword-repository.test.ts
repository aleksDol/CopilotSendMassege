import test from "node:test";
import assert from "node:assert/strict";
import { PrismaLeadKeywordRepository } from "./prisma-lead-keyword-repository.js";

const makeKeywordRow = (overrides: Record<string, unknown> = {}) => ({
  id: "k1",
  userId: "u1",
  telegramAccountId: "ta1",
  keyword: "x",
  target: "message",
  matchType: "contains",
  category: "general",
  priority: 0,
  isActive: true,
  createdAt: new Date("2026-04-24T00:00:00.000Z"),
  updatedAt: new Date("2026-04-24T00:00:00.000Z"),
  ...overrides
});

test("addKeyword defaults target to message when omitted", async () => {
  let receivedData: any = null;
  const repo = new PrismaLeadKeywordRepository({
    leadRadarKeyword: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        receivedData = data;
        return makeKeywordRow({ target: String(data.target ?? "message") });
      }
    }
  } as any);

  const out: any = await repo.addKeyword({
    user_id: "u1",
    telegram_account_id: "ta1",
    keyword: "need bot",
    match_type: "contains" as any,
    category: "general" as any
  });

  assert.equal(receivedData?.target, "message");
  assert.equal(out.target, "message");
});

test("addKeyword stores author_profile target when provided", async () => {
  let receivedData: any = null;
  const repo = new PrismaLeadKeywordRepository({
    leadRadarKeyword: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        receivedData = data;
        return makeKeywordRow({ target: String(data.target ?? "message") });
      }
    }
  } as any);

  const out: any = await repo.addKeyword({
    user_id: "u1",
    telegram_account_id: "ta1",
    keyword: "founder",
    target: "author_profile" as any,
    match_type: "contains" as any,
    category: "general" as any
  });

  assert.equal(receivedData?.target, "author_profile");
  assert.equal(out.target, "author_profile");
});

test("bulkAddKeywords dedupes within request and skips existing keywords", async () => {
  const created: Array<Record<string, unknown>> = [];
  const repo = new PrismaLeadKeywordRepository({
    leadRadarKeyword: {
      findMany: async () => [{ keyword: "existing phrase" }],
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created.push(data);
        return makeKeywordRow({ keyword: String(data.keyword ?? "") });
      }
    }
  } as any);

  const result = await repo.bulkAddKeywords({
    user_id: "u1",
    telegram_account_id: "ta1",
    keywords: [
      { keyword: "existing phrase", match_type: "contains" as any, category: "general" as any },
      { keyword: "  Existing Phrase  ", match_type: "contains" as any, category: "general" as any },
      { keyword: "new one", match_type: "contains" as any, category: "general" as any },
      { keyword: "new one", match_type: "exact" as any, category: "general" as any }
    ]
  });

  assert.equal(result.createdCount, 1);
  assert.equal(result.skippedCount, 3);
  assert.equal(created.length, 1);
  assert.equal(created[0]?.keyword, "new one");
});
