import test from "node:test";
import assert from "node:assert/strict";
import { LeadMatchService } from "./lead-match-service.js";
import { LeadCategory } from "../../domain/enums/lead-category.js";
import { LeadKeywordTarget } from "../../domain/enums/lead-keyword-target.js";
import { LeadMatchType } from "../../domain/enums/lead-match-type.js";

test("message matcher ignores author_profile keywords and matches message keywords", async () => {
  const service = new LeadMatchService({
    keywordRepo: {
      listKeywords: async () => [
        {
          id: "k-msg",
          user_id: "u1",
          telegram_account_id: "ta1",
          keyword: "need bot",
          target: LeadKeywordTarget.MESSAGE,
          match_type: LeadMatchType.CONTAINS,
          category: LeadCategory.GENERAL,
          priority: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: "k-profile",
          user_id: "u1",
          telegram_account_id: "ta1",
          keyword: "founder",
          target: LeadKeywordTarget.AUTHOR_PROFILE,
          match_type: LeadMatchType.CONTAINS,
          category: LeadCategory.GENERAL,
          priority: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ],
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

  const res = await service.match({
    userId: "u1",
    telegramAccountId: "ta1",
    chatId: "chat-1",
    chatTitle: "c",
    chatType: "GROUP",
    messageId: "m1",
    senderId: "s1",
    senderUsername: "user",
    senderDisplayName: "User",
    text: "we need bot for support",
    date: new Date()
  });

  assert.equal(res.matched, true);
  if (res.matched) {
    assert.deepEqual(res.matchedKeywords, ["need bot"]);
    assert.equal(res.matchedKeywords.includes("founder"), false);
  }
});

test("contains matcher does not match inside longer words", async () => {
  const service = new LeadMatchService({
    keywordRepo: {
      listKeywords: async () => [
        {
          id: "k-audit",
          user_id: "u1",
          telegram_account_id: "ta1",
          keyword: "аудит",
          target: LeadKeywordTarget.MESSAGE,
          match_type: LeadMatchType.CONTAINS,
          category: LeadCategory.GENERAL,
          priority: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        },
        {
          id: "k-bor",
          user_id: "u1",
          telegram_account_id: "ta1",
          keyword: "бор",
          target: LeadKeywordTarget.MESSAGE,
          match_type: LeadMatchType.CONTAINS,
          category: LeadCategory.GENERAL,
          priority: 0,
          is_active: true,
          created_at: new Date(),
          updated_at: new Date()
        }
      ],
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

  const res = await service.match({
    userId: "u1",
    telegramAccountId: "ta1",
    chatId: "chat-1",
    chatTitle: "c",
    chatType: "GROUP",
    messageId: "m1",
    senderId: "s1",
    senderUsername: "user",
    senderDisplayName: "User",
    text: "АУДИТория и Ксения БАРанова",
    date: new Date()
  });

  assert.equal(res.matched, false);
});
