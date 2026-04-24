import test from "node:test";
import assert from "node:assert/strict";
import { leadRadarMappers } from "./mappers.js";

test("lead mapper serializes sourceType for author_profile leads", () => {
  const out = leadRadarMappers.lead({
    id: "l1",
    userId: "u1",
    telegramAccountId: "ta1",
    telegramUserId: "777",
    username: "author",
    displayName: "Author",
    chatId: "chat-1",
    chatTitle: "Chat",
    sourceType: "author_profile",
    relatedPostId: null,
    contextPreview: null,
    messageId: "m1",
    messageText: "reason",
    messageDate: new Date("2026-04-24T00:00:00.000Z"),
    matchedKeywords: [],
    score: 10,
    leadType: null,
    status: "new" as any,
    notes: null,
    contactedAt: null,
    createdAt: new Date("2026-04-24T00:00:00.000Z"),
    updatedAt: new Date("2026-04-24T00:00:00.000Z")
  });

  assert.equal(out.source_type, "author_profile");
});

