import test from "node:test";
import assert from "node:assert/strict";
import { buildAuthorProfileCacheInput, DEFAULT_AUTHOR_PROFILE_CACHE_TTL_DAYS } from "./author-profile-cache-builder.js";

test("cache builder trims fields and converts empty strings to null", () => {
  const now = new Date("2026-04-24T10:00:00.000Z");
  const out = buildAuthorProfileCacheInput({
    telegramAccountId: "  ta-1 ",
    telegramUserId: "  12345 ",
    username: "  @alice ",
    displayName: "   ",
    bio: "",
    linkedChannelId: " -100123 ",
    linkedChannelUsername: " ",
    linkedChannelTitle: " Channel ",
    linkedChannelDescription: undefined,
    rawProfileJson: null,
    now
  });

  assert.equal(out.telegram_account_id, "ta-1");
  assert.equal(out.telegram_user_id, "12345");
  assert.equal(out.username, "@alice");
  assert.equal(out.display_name, null);
  assert.equal(out.bio, null);
  assert.equal(out.linked_channel_id, "-100123");
  assert.equal(out.linked_channel_username, null);
  assert.equal(out.linked_channel_title, "Channel");
  assert.equal(out.linked_channel_description, null);
});

test("cache builder computes expiresAt using default TTL days", () => {
  const now = new Date("2026-04-24T00:00:00.000Z");
  const out = buildAuthorProfileCacheInput({
    telegramAccountId: "ta-1",
    telegramUserId: "42",
    now
  });

  const expectedMs = now.getTime() + DEFAULT_AUTHOR_PROFILE_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  assert.equal(out.fetched_at.toISOString(), now.toISOString());
  assert.equal(out.expires_at.getTime(), expectedMs);
});

