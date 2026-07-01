import test from "node:test";
import assert from "node:assert/strict";
import { createKeywordBodySchema, bulkKeywordsBodySchema, updateKeywordBodySchema, updateSettingsBodySchema } from "./schemas.js";

test("createKeywordBodySchema defaults target to message", () => {
  const out = createKeywordBodySchema.parse({
    keyword: "automation",
    matchType: "contains",
    category: "general"
  });
  assert.equal(out.target, "message");
});

test("createKeywordBodySchema accepts author_profile target", () => {
  const out = createKeywordBodySchema.parse({
    keyword: "founder",
    target: "author_profile",
    matchType: "exact",
    category: "general"
  });
  assert.equal(out.target, "author_profile");
});

test("author_profile keyword must be at least 3 chars (after trim)", () => {
  assert.throws(() =>
    createKeywordBodySchema.parse({
      keyword: "  ab ",
      target: "author_profile",
      matchType: "contains",
      category: "general"
    })
  );

  // update: only enforced when patch explicitly sets target=author_profile
  assert.throws(() => updateKeywordBodySchema.parse({ target: "author_profile", keyword: "ab" }));
  assert.doesNotThrow(() => updateKeywordBodySchema.parse({ keyword: "ab" }));
});

test("keyword target validation rejects invalid values", () => {
  assert.throws(() =>
    createKeywordBodySchema.parse({
      keyword: "x",
      target: "invalid_target",
      matchType: "contains",
      category: "general"
    })
  );
  assert.throws(() => updateKeywordBodySchema.parse({ target: "invalid_target" }));
});

test("updateSettingsBodySchema accepts authorProfileMatchingEnabled boolean", () => {
  const out = updateSettingsBodySchema.parse({ authorProfileMatchingEnabled: true });
  assert.equal(out.authorProfileMatchingEnabled, true);
});

test("bulkKeywordsBodySchema requires channelAccountId and keywords array", () => {
  const out = bulkKeywordsBodySchema.parse({
    channelAccountId: "550e8400-e29b-41d4-a716-446655440000",
    keywords: [
      {
        keyword: "посоветуйте разработчика",
        matchType: "contains",
        target: "message",
        category: "website",
        priority: 1
      }
    ]
  });
  assert.equal(out.keywords.length, 1);
  assert.equal(out.keywords[0]?.matchType, "contains");
  assert.equal(out.keywords[0]?.target, "message");
});
