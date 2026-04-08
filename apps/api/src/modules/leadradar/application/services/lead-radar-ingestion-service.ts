import type { LeadRepository } from "../../infrastructure/repositories/lead-repository.js";
import type { LeadSourceRepository } from "../../infrastructure/repositories/lead-source-repository.js";
import type { LeadSettingsRepository } from "../../infrastructure/repositories/lead-settings-repository.js";
import type { LeadDeduplicationService } from "./lead-deduplication-service.js";
import type { LeadMatchService } from "./lead-match-service.js";
import type { LeadScoringService } from "./lead-scoring-service.js";
import { LeadStatus } from "../../domain/enums/lead-status.js";
import type { LeadRadarMessageInput } from "../../types/ingestion.js";
import type { PrismaClient } from "@prisma/client";

export class LeadRadarIngestionService {
  constructor(
    private readonly deps: {
      leadRepo: LeadRepository;
      sourceRepo: LeadSourceRepository;
      settingsRepo: LeadSettingsRepository;
      matchService: LeadMatchService;
      scoringService: LeadScoringService;
      dedupeService: LeadDeduplicationService;
      prisma: PrismaClient;
      logger?: { info: (msg: string) => void };
    }
  ) {}

  private async getMessagesBefore(params: {
    userId: string;
    telegramAccountId: string;
    chatId: string;
    beforeDate: Date;
    limit: number;
  }): Promise<Array<{ text: string | null; sender: string | null; date: string }>> {
    const telegram = await this.deps.prisma.telegramAccount.findUnique({
      where: { id: params.telegramAccountId },
      select: { channelAccountId: true, channelAccount: { select: { companyId: true } } }
    });
    if (!telegram) return [];

    const convo = await this.deps.prisma.conversation.findUnique({
      where: {
        channelAccountId_externalConversationId: {
          channelAccountId: telegram.channelAccountId,
          externalConversationId: params.chatId
        }
      },
      select: { id: true }
    });
    if (!convo) return [];

    const rows = await this.deps.prisma.message.findMany({
      where: {
        conversationId: convo.id,
        sentAt: { lt: params.beforeDate }
      },
      orderBy: [{ sentAt: "desc" }, { id: "desc" }],
      take: params.limit,
      include: {
        participant: {
          select: {
            externalParticipantId: true,
            username: true,
            fullName: true,
            isSelf: true
          }
        }
      }
    });

    return rows.map((m) => ({
      text: m.text ?? null,
      sender:
        m.participant?.username?.trim()
          ? `@${m.participant.username}`
          : m.participant?.fullName?.trim()
            ? m.participant.fullName
            : m.participant?.externalParticipantId ?? null,
      date: m.sentAt.toISOString()
    }));
  }

  private async getMessagesAfter(_params: {
    // V1: optional; can be implemented later without Telegram API.
    limit: number;
  }): Promise<Array<{ text: string | null; sender: string | null; date: string }>> {
    return [];
  }

  async processMessage(input: LeadRadarMessageInput): Promise<void> {
    const log = (msg: string) => {
      console.log(msg);
      try {
        this.deps.logger?.info(msg);
      } catch {
        // noop
      }
    };

    log(`[LeadRadar-DEBUG] processMessage ENTER userId=${input.userId} telegramAccountId=${input.telegramAccountId} chatId=${input.chatId} text="${(input.text ?? "").slice(0, 80)}"`);

    // 1) Settings check
    const settings =
      (await this.deps.settingsRepo.getSettings({
        user_id: input.userId,
        telegram_account_id: input.telegramAccountId
      })) ??
      (await this.deps.settingsRepo.createDefaultIfNotExists({
        user_id: input.userId,
        telegram_account_id: input.telegramAccountId
      }));

    log(`[LeadRadar-DEBUG] settings.is_enabled=${settings.is_enabled} min_score=${settings.min_score_threshold}`);

    if (!settings.is_enabled) {
      log("[LeadRadar] skipped: disabled");
      return;
    }

    // 2) Source check
    const sourceChatId =
      input.chatType === "GROUP" && input.relatedChannelId ? input.relatedChannelId : input.chatId;

    const source = await this.deps.sourceRepo.findByTelegramChatId({
      user_id: input.userId,
      telegram_account_id: input.telegramAccountId,
      telegram_chat_id: sourceChatId
    });

    log(
      `[LeadRadar-DEBUG] source lookup chatId=${sourceChatId} found=${!!source} active=${source?.is_active ?? "N/A"}`
    );

    if (!source || !source.is_active) {
      log("[LeadRadar] skipped: not a source");
      return;
    }

    // 3) Keyword match (real)
    const match = await this.deps.matchService.match(input);
    log(`[LeadRadar-DEBUG] match result: matched=${match.matched} keywords=${JSON.stringify(match.matchedKeywords)}`);
    if (!match.matched) {
      if (match.reason === "negative_keyword") {
        log("[LeadRadar] skipped: negative keyword");
      } else {
        log("[LeadRadar] skipped: no match");
      }
      return;
    }
    log(`[LeadRadar] matched keywords: ${JSON.stringify(match.matchedKeywords)}`);

    // 4) Scoring (real)
    const score = await this.deps.scoringService.score({
      message: input,
      matchedKeywords: match.matchedKeywords,
      categories: match.categories
    });
    log(`[LeadRadar-DEBUG] score=${score} threshold=${settings.min_score_threshold}`);

    // 5) Threshold check
    if (score < settings.min_score_threshold) {
      log("[LeadRadar] skipped: below threshold");
      return;
    }

    // 6) Deduplication (hard + soft)
    const hardDup = await this.deps.dedupeService.isHardDuplicate({ message: input });
    if (hardDup) {
      log("[LeadRadar] skipped: duplicate");
      return;
    }

    const softDup = await this.deps.dedupeService.isSoftDuplicate({
      message: input,
      dedupeWindowHours: settings.dedupe_window_hours
    });
    if (softDup) {
      log("[LeadRadar] skipped: soft duplicate");
      return;
    }

    // 7) Load context (best effort)
    let contextBefore: Array<{ text: string | null; sender: string | null; date: string }> = [];
    let contextAfter: Array<{ text: string | null; sender: string | null; date: string }> = [];
    const maxBefore = Math.min(5, Math.max(0, settings.context_before_count));
    const maxAfter = Math.min(2, Math.max(0, settings.context_after_count));

    if (settings.store_context_enabled && (maxBefore > 0 || maxAfter > 0)) {
      try {
        if (maxBefore > 0) {
          contextBefore = await this.getMessagesBefore({
            userId: input.userId,
            telegramAccountId: input.telegramAccountId,
            chatId: input.chatId,
            beforeDate: input.date,
            limit: maxBefore
          });
        }
        if (maxAfter > 0) {
          contextAfter = await this.getMessagesAfter({ limit: maxAfter });
        }
        log(`[LeadRadar] context loaded: ${contextBefore.length} before, ${contextAfter.length} after`);
      } catch {
        log("[LeadRadar] context skipped");
      }
    } else {
      log("[LeadRadar] context skipped");
    }

    // 7) Save lead
    await this.deps.leadRepo.createLead({
      user_id: input.userId,
      telegram_account_id: input.telegramAccountId,
      telegram_user_id: input.senderId,
      username: input.senderUsername,
      display_name: input.senderDisplayName,
      chat_id: sourceChatId,
      chat_title: input.chatTitle ?? null,
      source_type: source.chat_type ?? input.sourceType ?? null,
      related_post_id: input.relatedPostId ?? null,
      context_preview: input.contextPreview ?? null,
      message_id: input.messageId,
      message_text: input.text ?? null,
      message_date: input.date,
      matched_keywords_json: {
        matched: true,
        matchedKeywords: match.matchedKeywords,
        categories: match.categories
      },
      score,
      lead_type: null,
      status: LeadStatus.NEW,
      notes: null,
      contacted_at: null,
      context:
        settings.store_context_enabled && (contextBefore.length > 0 || contextAfter.length > 0)
          ? {
              before_messages_json: contextBefore,
              after_messages_json: contextAfter
            }
          : null
    });

    log("[LeadRadar] lead created");
    log("[LeadRadar] message processed");
  }
}

