import test from "node:test";
import assert from "node:assert/strict";
import { enqueueAuthorProfileCheck, toAuthorProfileCheckJobId } from "./leadradar-queue.js";

test("enqueueAuthorProfileCheck skips when no telegramUserId and no username", async () => {
  const out = await enqueueAuthorProfileCheck(
    {
      REDIS_URL: "redis://localhost:6379",
      DATABASE_URL: "postgresql://example",
      JWT_SECRET: "x".repeat(32),
      TELEGRAM_WORKER_URL: "http://localhost:8000",
      INTERNAL_API_TOKEN: "x".repeat(16)
    } as any,
    {
      userId: "u1",
      telegramAccountId: "ta1",
      sourceChatId: "chat-1",
      sourceMessageId: "m1"
    }
  );
  assert.deepEqual(out, { enqueued: false, reason: "missing_author_identity" });
});

test("author-profile jobId dedupes by telegramAccountId + telegramUserId", () => {
  const out = toAuthorProfileCheckJobId({
    telegramAccountId: "ta1",
    telegramUserId: "777",
    username: "@someone"
  });
  assert.equal(out, "leadradar-author-profile-check-ta1-777");
});

test("author-profile jobId falls back to normalized username", () => {
  const out = toAuthorProfileCheckJobId({
    telegramAccountId: "ta1",
    telegramUserId: null,
    username: " @Some_User "
  });
  assert.equal(out, "leadradar-author-profile-check-ta1-username-some_user");
});

