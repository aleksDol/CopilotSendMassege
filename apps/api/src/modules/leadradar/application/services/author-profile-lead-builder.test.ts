import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorProfileLeadCreateInput } from "./author-profile-lead-builder.js";

const basePayload = {
  userId: "u1",
  telegramAccountId: "ta1",
  telegramUserId: "777",
  sourceChatId: "chat-1",
  sourceChatTitle: "Source Chat",
  sourceMessageId: "m1",
  sourceMessageDate: "2026-04-24T10:00:00.000Z",
  username: "@payload_user",
  displayName: "Payload Name",
  contextPreview: " preview ",
  relatedPostId: " post-1 "
};

const baseMatch = {
  matched: true,
  score: 9,
  reason: "Profile matched",
  matchedKeywords: [{ keywordId: "k1", keyword: "smm", score: 9 }]
} as any;

test("builder creates sourceType=author_profile and maps score/status/matchedKeywords", () => {
  const out = buildAuthorProfileLeadCreateInput({
    payload: basePayload,
    matchResult: baseMatch
  });
  assert.ok(out);
  assert.equal(out?.source_type, "author_profile");
  assert.equal(out?.status, "new");
  assert.equal(out?.score, 9);
  assert.deepEqual((out?.matched_keywords_json as any).matchedKeywords, baseMatch.matchedKeywords);
});

test("builder uses cache username/displayName over payload fallback", () => {
  const out = buildAuthorProfileLeadCreateInput({
    payload: basePayload,
    matchResult: baseMatch,
    cache: {
      username: "cached_user",
      display_name: "Cached Name"
    } as any
  });
  assert.equal(out?.username, "cached_user");
  assert.equal(out?.display_name, "Cached Name");
});

test("builder uses payload source chat/message/date", () => {
  const out = buildAuthorProfileLeadCreateInput({
    payload: basePayload,
    matchResult: baseMatch
  });
  assert.equal(out?.chat_id, "chat-1");
  assert.equal(out?.chat_title, "Source Chat");
  assert.equal(out?.message_date.toISOString(), "2026-04-24T10:00:00.000Z");
  assert.equal(out?.context_preview, "preview");
  assert.equal(out?.related_post_id, "post-1");
});

test("builder creates short fallback messageText if reason missing", () => {
  const out = buildAuthorProfileLeadCreateInput({
    payload: basePayload,
    matchResult: {
      ...baseMatch,
      reason: "   "
    }
  });
  assert.equal(out?.message_text, "Author profile matched by keywords");
});

