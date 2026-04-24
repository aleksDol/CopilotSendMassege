import test from "node:test";
import assert from "node:assert/strict";
import { LeadRadarIngestionService } from "./lead-radar-ingestion-service.js";
import type { LeadRadarMessageInput } from "../../types/ingestion.js";
import type { FindSourceByTelegramChatIdInput } from "../../types/repository-inputs.js";
import type { LeadSource } from "../../domain/entities/lead-source.js";

function baseMessage(overrides: Partial<LeadRadarMessageInput> = {}): LeadRadarMessageInput {
  return {
    userId: "u1",
    telegramAccountId: "ta1",
    chatId: "chat1",
    chatTitle: "Chat",
    chatType: "DIRECT",
    messageId: "m1",
    senderId: "tg-user-1",
    senderUsername: "alice",
    senderDisplayName: "Alice",
    sourceType: "direct",
    relatedChannelId: null,
    relatedPostId: null,
    contextPreview: null,
    text: "hello",
    date: new Date("2026-04-20T10:00:00.000Z"),
    ...overrides
  };
}

const defaultActiveSource = (): LeadSource => ({
  id: "src1",
  user_id: "u1",
  telegram_account_id: "ta1",
  telegram_chat_id: "chat1",
  chat_title: null,
  chat_type: "direct",
  is_active: true,
  created_at: new Date("2026-04-01T00:00:00.000Z"),
  updated_at: new Date("2026-04-01T00:00:00.000Z")
});

function makeService(params?: {
  match?: (input: LeadRadarMessageInput) => Promise<any>;
  score?: (args: any) => Promise<any>;
  findByTelegramChatId?: (input: FindSourceByTelegramChatIdInput) => Promise<LeadSource | null>;
}) {
  const calls: { createLead: any[] } = { createLead: [] };

  const service = new LeadRadarIngestionService({
    leadRepo: {
      createLead: async (input: any) => {
        calls.createLead.push(input);
        return input;
      },
      existsByMessage: async () => false,
      existsRecentFromSenderInChat: async () => false,
      findRecentLeadForMultiChatMerge: async () => null,
      mergeMultiChatLead: async () => {
        throw new Error("unexpected mergeMultiChatLead in these tests");
      }
    } as any,
    sourceRepo: {
      findByTelegramChatId: params?.findByTelegramChatId ?? (async () => defaultActiveSource())
    } as any,
    settingsRepo: {
      getSettings: async () => ({
        user_id: "u1",
        telegram_account_id: "ta1",
        is_enabled: true,
        min_score_threshold: 0,
        dedupe_window_hours: 24,
        store_context_enabled: false,
        context_before_count: 0,
        context_after_count: 0
      }),
      createDefaultIfNotExists: async () => ({
        user_id: "u1",
        telegram_account_id: "ta1",
        is_enabled: true,
        min_score_threshold: 0,
        dedupe_window_hours: 24,
        store_context_enabled: false,
        context_before_count: 0,
        context_after_count: 0
      })
    } as any,
    matchService: {
      match:
        params?.match ??
        (async (input: LeadRadarMessageInput) => {
          if ((input.text ?? "").includes("KEY")) {
            return { matched: true, matchedKeywords: ["KEY"], categories: ["default"] };
          }
          return {
            matched: false,
            reason: "no_positive_match",
            matchedKeywords: [],
            categories: [],
            debug: {
              normalized_text: String(input.text ?? ""),
              negative_keyword_matches: [],
              positive_keyword_matches: [],
              positive_keyword_matches_detailed: []
            }
          };
        })
    } as any,
    scoringService: {
      score:
        params?.score ??
        (async () => {
          return 100;
        })
    } as any,
    dedupeService: {
      isHardDuplicate: async () => false,
      isSoftDuplicate: async () => false
    } as any,
    prisma: {
      leadRadarLead: {
        findFirst: async () => null
      }
    } as any,
    logger: { info: () => {} },
    multiChatDedupeWindowHours: 3,
    multiChatScoreBonus: 35
  });

  return { service, calls };
}

test("Case 1: A has match, B has no match -> B does not create lead and must not reuse A", async () => {
  const { service, calls } = makeService();

  await service.processMessage(baseMessage({ messageId: "A", text: "please KEY me" }));
  assert.equal(calls.createLead.length, 1);
  assert.equal(calls.createLead[0].message_id, "A");
  assert.equal(calls.createLead[0].message_text, "please KEY me");

  await service.processMessage(baseMessage({ messageId: "B", text: "just saying hi" }));
  assert.equal(calls.createLead.length, 1);
});

test("Case 2: message without match -> no lead", async () => {
  const { service, calls } = makeService();
  await service.processMessage(baseMessage({ messageId: "A", text: "no keyword here" }));
  assert.equal(calls.createLead.length, 0);
});

test("Case 3: A has match, B has match -> both evaluated as current messages (2 leads when no dedupe)", async () => {
  const { service, calls } = makeService();

  await service.processMessage(baseMessage({ messageId: "A", text: "KEY one" }));
  await service.processMessage(baseMessage({ messageId: "B", text: "KEY two" }));

  assert.equal(calls.createLead.length, 2);
  assert.equal(calls.createLead[0].message_id, "A");
  assert.equal(calls.createLead[0].message_text, "KEY one");
  assert.equal(calls.createLead[1].message_id, "B");
  assert.equal(calls.createLead[1].message_text, "KEY two");
});

test("Case 4: GROUP with relatedChannelId resolves active source registered on group chat id (not only channel)", async () => {
  const lookupOrder: string[] = [];
  const { service, calls } = makeService({
    findByTelegramChatId: async ({ telegram_chat_id }) => {
      lookupOrder.push(telegram_chat_id);
      if (telegram_chat_id === "-100GROUP") {
        return {
          ...defaultActiveSource(),
          telegram_chat_id: "-100GROUP",
          chat_type: "group"
        };
      }
      return null;
    }
  });

  await service.processMessage(
    baseMessage({
      chatType: "GROUP",
      chatId: "-100GROUP",
      relatedChannelId: "-100CHAN",
      text: "KEY group"
    })
  );

  assert.deepEqual(lookupOrder, ["-100GROUP"]);
  assert.equal(calls.createLead.length, 1);
});

test("Case 5: GROUP falls back to linked channel id when group has no source (discussion-style)", async () => {
  const lookupOrder: string[] = [];
  const { service, calls } = makeService({
    findByTelegramChatId: async ({ telegram_chat_id }) => {
      lookupOrder.push(telegram_chat_id);
      if (telegram_chat_id === "-100GROUP") return null;
      if (telegram_chat_id === "-100CHAN") {
        return {
          ...defaultActiveSource(),
          telegram_chat_id: "-100CHAN",
          chat_type: "channel"
        };
      }
      return null;
    }
  });

  await service.processMessage(
    baseMessage({
      chatType: "GROUP",
      chatId: "-100GROUP",
      relatedChannelId: "-100CHAN",
      text: "KEY channel"
    })
  );

  assert.deepEqual(lookupOrder, ["-100GROUP", "-100CHAN"]);
  assert.equal(calls.createLead.length, 1);
});
