import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChatTypeLabel,
  isCatalogEntryDuplicate,
  parseTelegramUsernameFromLink
} from "./catalog-entry-helpers";

test("parseTelegramUsernameFromLink supports t.me urls and @handles", () => {
  assert.equal(parseTelegramUsernameFromLink("https://t.me/wolf_vakansii"), "wolf_vakansii");
  assert.equal(parseTelegramUsernameFromLink("@wolf_vakansii"), "wolf_vakansii");
  assert.equal(parseTelegramUsernameFromLink("wolf_vakansii"), "wolf_vakansii");
});

test("parseTelegramUsernameFromLink rejects invite links", () => {
  assert.equal(parseTelegramUsernameFromLink("https://t.me/+AbCdEf"), null);
  assert.equal(parseTelegramUsernameFromLink("https://t.me/joinchat/abc"), null);
});

test("formatChatTypeLabel maps known chat types", () => {
  assert.equal(formatChatTypeLabel("group"), "Группа");
  assert.equal(formatChatTypeLabel("channel_comments"), "Канал с комментариями");
});

test("isCatalogEntryDuplicate matches chat id or username", () => {
  const entries = [
    {
      id: "1",
      title: "Test",
      telegram_username: "wolf_vakansii",
      telegram_chat_id: "-100123",
      chat_type: "group",
      status: "review" as const,
      note: null,
      last_checked_at: null,
      topic_ids: [],
      topics: [],
      created_at: "",
      updated_at: ""
    }
  ];

  assert.equal(isCatalogEntryDuplicate(entries, "-100123", null), true);
  assert.equal(isCatalogEntryDuplicate(entries, "-100999", "wolf_vakansii"), true);
  assert.equal(isCatalogEntryDuplicate(entries, "-100999", "other_chat"), false);
});
