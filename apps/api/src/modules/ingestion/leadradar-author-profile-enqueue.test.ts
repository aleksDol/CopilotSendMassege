import test from "node:test";
import assert from "node:assert/strict";
import { enqueueAuthorProfileCheckBestEffort, toAuthorProfileCheckPayload } from "./leadradar-author-profile-enqueue.js";

test("ingestion enqueue is best-effort and does not throw if queue fails", async () => {
  let warned = false;
  const logger = {
    info: () => {},
    warn: () => {
      warned = true;
    }
  };

  enqueueAuthorProfileCheckBestEffort({
    env: {
      ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: true
    } as any,
    logger,
    payload: {
      userId: "u1",
      telegramAccountId: "ta1",
      telegramUserId: "777",
      sourceChatId: "chat-1",
      sourceMessageId: "m1"
    },
    authorProfileMatchingEnabledForAccount: true,
    enqueueFn: async () => {
      throw new Error("boom");
    }
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(warned, true);
});

test("enqueue does not run when account setting is false", async () => {
  let called = false;
  enqueueAuthorProfileCheckBestEffort({
    env: {
      ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: true
    } as any,
    logger: {
      info: () => {},
      warn: () => {}
    },
    payload: {
      userId: "u1",
      telegramAccountId: "ta1",
      telegramUserId: "777",
      sourceChatId: "chat-1",
      sourceMessageId: "m1"
    },
    authorProfileMatchingEnabledForAccount: false,
    enqueueFn: async () => {
      called = true;
      return { enqueued: true as const, jobId: "x" };
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(called, false);
});

test("enqueue runs only when env flag true and account setting true", async () => {
  let called = false;
  enqueueAuthorProfileCheckBestEffort({
    env: {
      ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: true
    } as any,
    logger: {
      info: () => {},
      warn: () => {}
    },
    payload: {
      userId: "u1",
      telegramAccountId: "ta1",
      telegramUserId: "777",
      sourceChatId: "chat-1",
      sourceMessageId: "m1"
    },
    authorProfileMatchingEnabledForAccount: true,
    enqueueFn: async () => {
      called = true;
      return { enqueued: true as const, jobId: "x" };
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(called, true);
});

test("gate matrix: env/settings combinations control enqueue", async () => {
  const cases: Array<{
    envEnabled: boolean;
    settingEnabled: boolean;
    expectedCalled: boolean;
  }> = [
    { envEnabled: false, settingEnabled: false, expectedCalled: false },
    { envEnabled: false, settingEnabled: true, expectedCalled: false },
    { envEnabled: true, settingEnabled: false, expectedCalled: false },
    { envEnabled: true, settingEnabled: true, expectedCalled: true }
  ];

  for (const c of cases) {
    let called = false;
    enqueueAuthorProfileCheckBestEffort({
      env: {
        ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: c.envEnabled
      } as any,
      logger: {
        info: () => {},
        warn: () => {}
      },
      payload: {
        userId: "u1",
        telegramAccountId: "ta1",
        telegramUserId: "777",
        sourceChatId: "chat-1",
        sourceMessageId: "m1"
      },
      authorProfileMatchingEnabledForAccount: c.settingEnabled,
      enqueueFn: async () => {
        called = true;
        return { enqueued: true as const, jobId: "x" };
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(called, c.expectedCalled);
  }
});

test("author-profile enqueue gating is isolated and never throws when disabled", async () => {
  let called = false;
  assert.doesNotThrow(() => {
    enqueueAuthorProfileCheckBestEffort({
      env: {
        ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED: false
      } as any,
      logger: {
        info: () => {},
        warn: () => {}
      },
      payload: {
        userId: "u1",
        telegramAccountId: "ta1",
        telegramUserId: "777",
        sourceChatId: "chat-1",
        sourceMessageId: "m1"
      },
      authorProfileMatchingEnabledForAccount: true,
      enqueueFn: async () => {
        called = true;
        return { enqueued: true as const, jobId: "x" };
      }
    });
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(called, false);
});

test("toAuthorProfileCheckPayload maps author fields safely", () => {
  const out = toAuthorProfileCheckPayload({
    userId: "u1",
    telegramAccountId: "ta1",
    payload: {
      senderType: "user",
      senderExternalId: "777",
      senderUsername: "@Some_User",
      senderFullName: "Some User",
      externalConversationId: "chat-1",
      externalMessageId: "m1",
      sentAt: "2026-01-01T00:00:00.000Z",
      rawPayload: {
        chatType: "GROUP",
        relatedPostId: "post-1",
        contextPreview: "preview"
      }
    }
  });

  assert.equal(out.userId, "u1");
  assert.equal(out.telegramUserId, "777");
  assert.equal(out.username, "Some_User");
  assert.equal(out.sourceType, "GROUP");
  assert.equal(out.relatedPostId, "post-1");
});
