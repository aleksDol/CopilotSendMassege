import test from "node:test";
import assert from "node:assert/strict";
import { LeadRadarAuthorProfileMatchService } from "./lead-radar-author-profile-match-service.js";
import { LeadKeywordTarget } from "../../domain/enums/lead-keyword-target.js";
import { LeadMatchType } from "../../domain/enums/lead-match-type.js";
import { LeadCategory } from "../../domain/enums/lead-category.js";

const makeKeyword = (overrides: Partial<any>) => ({
  id: "k1",
  user_id: "u1",
  telegram_account_id: "ta1",
  keyword: "smm",
  target: LeadKeywordTarget.AUTHOR_PROFILE,
  match_type: LeadMatchType.CONTAINS,
  category: LeadCategory.GENERAL,
  priority: 2,
  is_active: true,
  created_at: new Date(),
  updated_at: new Date(),
  ...overrides
});

const createService = (keywords: any[]) =>
  new LeadRadarAuthorProfileMatchService({
    keywordRepo: {
      listKeywords: async () => keywords,
      listNegativeKeywords: async () => [],
      addKeyword: async () => {
        throw new Error("not used");
      },
      bulkAddKeywords: async () => {
        throw new Error("not used");
      },
      updateKeyword: async () => {
        throw new Error("not used");
      },
      removeKeyword: async () => {
        throw new Error("not used");
      },
      addNegativeKeyword: async () => {
        throw new Error("not used");
      },
      updateNegativeKeyword: async () => {
        throw new Error("not used");
      },
      removeNegativeKeyword: async () => {
        throw new Error("not used");
      }
    }
  });

const baseInput = {
  userId: "u1",
  telegramAccountId: "ta1",
  telegramUserId: "777",
  username: "@smm_pro",
  displayName: "SMM Manager",
  bio: "Маркетолог и growth specialist",
  linkedChannelUsername: "@acme_marketing",
  linkedChannelTitle: "Acme Marketing Team",
  linkedChannelDescription: "Практика SMM и performance"
};

test("uses only target=author_profile keywords and ignores message target", async () => {
  const service = createService([
    makeKeyword({ id: "k-msg", keyword: "acme", target: LeadKeywordTarget.MESSAGE, priority: 11 }),
    makeKeyword({ id: "k-auth", keyword: "маркетолог", target: LeadKeywordTarget.AUTHOR_PROFILE, priority: 3 })
  ]);

  const out = await service.match(baseInput);
  assert.equal(out.matched, true);
  assert.equal(out.matchedKeywords.length, 1);
  assert.equal(out.matchedKeywords[0]?.keywordId, "k-auth");
  assert.equal(out.matchedKeywords[0]?.target, "author_profile");
});

test("matches username contains and exact with or without @", async () => {
  const service = createService([
    makeKeyword({ id: "k1", keyword: "smm_pro", match_type: LeadMatchType.CONTAINS, priority: 2 }),
    makeKeyword({ id: "k2", keyword: "@smm_pro", match_type: LeadMatchType.EXACT, priority: 4 })
  ]);

  const out = await service.match({
    ...baseInput,
    username: "smm_pro",
    displayName: null,
    bio: null,
    linkedChannelTitle: null,
    linkedChannelDescription: null
  });

  assert.equal(out.matched, true);
  assert.equal(out.score, 6);
  assert.equal(out.matchedKeywords.every((m) => m.field === "username"), true);
});

test("matches displayName, bio, linkedChannelTitle and linkedChannelDescription", async () => {
  const service = createService([
    makeKeyword({ id: "d", keyword: "manager", priority: 1 }),
    makeKeyword({ id: "b", keyword: "growth", priority: 2 }),
    makeKeyword({ id: "t", keyword: "marketing team", priority: 3 }),
    makeKeyword({ id: "c", keyword: "performance", priority: 4 })
  ]);

  const out = await service.match(baseInput);
  assert.equal(out.matched, true);
  assert.equal(out.score, 10);
  assert.equal(out.matchedKeywords.some((m) => m.field === "displayName"), true);
  assert.equal(out.matchedKeywords.some((m) => m.field === "bio"), true);
  assert.equal(out.matchedKeywords.some((m) => m.field === "linkedChannelTitle"), true);
  assert.equal(out.matchedKeywords.some((m) => m.field === "linkedChannelDescription"), true);
});

test("regex match works and invalid regex does not crash", async () => {
  const service = createService([
    makeKeyword({ id: "good", keyword: "^acme\\s+marketing", match_type: LeadMatchType.REGEX, priority: 5 }),
    makeKeyword({ id: "bad", keyword: "([", match_type: LeadMatchType.REGEX, priority: 99 })
  ]);

  const out = await service.match(baseInput);
  assert.equal(out.matched, true);
  assert.equal(out.matchedKeywords.some((m) => m.keywordId === "good"), true);
  assert.equal(out.matchedKeywords.some((m) => m.keywordId === "bad"), false);
});

test("ignores empty keywords, too-short keywords, inactive keywords and empty fields", async () => {
  const service = createService([
    makeKeyword({ id: "empty", keyword: "   ", priority: 5 }),
    makeKeyword({ id: "short", keyword: "a", priority: 5 }),
    makeKeyword({ id: "inactive", keyword: "smm", is_active: false, priority: 5 }),
    makeKeyword({ id: "valid", keyword: "smm", priority: 5 })
  ]);

  const outNoFields = await service.match({
    ...baseInput,
    username: " ",
    displayName: null,
    bio: "",
    linkedChannelUsername: " ",
    linkedChannelTitle: "",
    linkedChannelDescription: null
  });
  assert.equal(outNoFields.matched, false);
  assert.equal(outNoFields.score, 0);

  const outWithField = await service.match({
    ...baseInput,
    username: "@smm_pro",
    displayName: null,
    bio: null
  });
  assert.equal(outWithField.matchedKeywords.some((m) => m.keywordId === "valid"), true);
  assert.equal(outWithField.matchedKeywords.some((m) => m.keywordId === "empty"), false);
  assert.equal(outWithField.matchedKeywords.some((m) => m.keywordId === "short"), false);
  assert.equal(outWithField.matchedKeywords.some((m) => m.keywordId === "inactive"), false);
});

test("matchedKeywords include field and capped valuePreview, reason is short and informative", async () => {
  const veryLongBio = `${"x".repeat(180)} founder`;
  const service = createService([makeKeyword({ id: "k", keyword: "founder", priority: 7 })]);

  const out = await service.match({
    ...baseInput,
    username: null,
    displayName: null,
    bio: veryLongBio,
    linkedChannelUsername: null,
    linkedChannelTitle: null,
    linkedChannelDescription: null
  });

  assert.equal(out.matched, true);
  assert.equal(out.score, 7);
  assert.equal(out.matchedKeywords[0]?.field, "bio");
  assert.equal((out.matchedKeywords[0]?.valuePreview.length ?? 0) <= 120, true);
  assert.match(out.reason, /Профиль автора совпал/u);
  assert.equal(out.reason.length <= 220, true);
});

test("no match returns matched=false and score=0", async () => {
  const service = createService([
    makeKeyword({ id: "k", keyword: "devops", target: LeadKeywordTarget.AUTHOR_PROFILE, priority: 9 })
  ]);

  const out = await service.match({
    ...baseInput,
    username: "@designer",
    displayName: "Creative Lead",
    bio: "UX/UI",
    linkedChannelTitle: "Art Team",
    linkedChannelDescription: "visuals only"
  });

  assert.equal(out.matched, false);
  assert.equal(out.score, 0);
  assert.equal(out.matchedKeywords.length, 0);
});
