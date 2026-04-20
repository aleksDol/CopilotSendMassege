import type { LeadRepository } from "../../infrastructure/repositories/lead-repository.js";
import type { LeadSourceRepository } from "../../infrastructure/repositories/lead-source-repository.js";
import type { LeadSettingsRepository } from "../../infrastructure/repositories/lead-settings-repository.js";
import type { LeadDeduplicationService } from "./lead-deduplication-service.js";
import type { LeadMatchService } from "./lead-match-service.js";
import type { LeadScoringService } from "./lead-scoring-service.js";
import { LeadStatus } from "../../domain/enums/lead-status.js";
import type { LeadRadarMessageInput } from "../../types/ingestion.js";
import type { PrismaClient } from "@prisma/client";
import { normalizeLeadRadarText } from "../../lib/text-normalization.js";

type LeadRadarFinalAction = "created" | "merged" | "skipped";
type LeadRadarSkipReason =
  | "disabled"
  | "not_monitored_source"
  | "before_monitoring_started"
  | "no_positive_match"
  | "no_positive_match_on_current_message"
  | "negative_match"
  | "below_threshold"
  | "duplicate_hard"
  | "duplicate_soft"
  | "merged_existing_lead";

const isLeadRadarDebugEnabled = (): boolean => {
  const v = String(process.env.ENABLE_LEADRADAR_DEBUG ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes" || v === "on";
};

const shouldTraceMessage = (messageId: string): boolean => {
  const exact = String(process.env.LEADRADAR_DEBUG_MESSAGE_ID ?? "").trim();
  if (exact && messageId && exact === messageId) return true;
  return isLeadRadarDebugEnabled();
};

const normalizeUsernameForMerge = (u: string | null | undefined): string | null => {
  const t = u?.trim();
  if (!t) return null;
  return t.replace(/^@+/u, "").toLowerCase();
};

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
      /** Hours: same Telegram user across different chats → merge into one lead */
      multiChatDedupeWindowHours: number;
      multiChatScoreBonus: number;
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

    const traceEnabled = shouldTraceMessage(input.messageId);
    const { raw_text, normalized_text } = normalizeLeadRadarText(input.text ?? "");

    let final_action: LeadRadarFinalAction = "skipped";
    let skip_reason: LeadRadarSkipReason | null = null;
    let source_monitored = false;
    let positive_keyword_matches: string[] = [];
    let negative_keyword_matches: string[] = [];
    let score_breakdown: Record<string, number> | null = null;
    let threshold_passed = false;
    let dedupe_result: "none" | "hard" | "soft" | "merged_existing_lead" = "none";
    let history_messages_loaded_count = 0;
    let lead_created_from_message_id: string | null = null;

    if (traceEnabled) {
      log(
        `[LeadRadar-TRACE] ${JSON.stringify({
          phase: "enter",
          telegramAccountId: input.telegramAccountId,
          chatId: input.chatId,
          messageId: input.messageId,
          raw_text: raw_text.slice(0, 500),
          normalized_text: normalized_text.slice(0, 500)
        })}`
      );
    }

    log(
      `[LeadRadar-DEBUG] processMessage ENTER userId=${input.userId} telegramAccountId=${input.telegramAccountId} chatId=${input.chatId} messageId=${input.messageId} text="${(input.text ?? "").slice(0, 80)}"`
    );

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
      skip_reason = "disabled";
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: false,
            source_monitored,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text,
            positive_keyword_matches,
            negative_keyword_matches,
            score_breakdown,
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
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
      skip_reason = "not_monitored_source";
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: true,
            source_monitored: false,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text,
            positive_keyword_matches,
            negative_keyword_matches,
            score_breakdown,
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
      return;
    }
    source_monitored = true;

    // 2b) Guardrail: allow chat history ingestion, but only create leads for messages
    // sent after monitoring started.
    //
    // We use source.updated_at so operators can "reset" monitoring start by toggling
    // the source off/on (Disable/Enable) without deleting it. For newly created sources,
    // updated_at is equal to created_at.
    const monitoringStartedAt = source.updated_at ?? source.created_at;
    // Small tolerance window to avoid edge cases where the source gets enabled/updated
    // and the user sends a message immediately: Telegram timestamps and DB timestamps
    // can differ by a few seconds.
    const monitoringToleranceMs = 10_000; // 10s
    if (
      input.date &&
      monitoringStartedAt &&
      input.date.getTime() + monitoringToleranceMs < new Date(monitoringStartedAt as any).getTime()
    ) {
      log("[LeadRadar] skipped: before monitoring started");
      skip_reason = "before_monitoring_started";
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: true,
            source_monitored,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text,
            monitoring_started_at: monitoringStartedAt?.toISOString?.() ?? String(monitoringStartedAt),
            message_date: input.date?.toISOString?.() ?? String(input.date),
            monitoring_tolerance_ms: monitoringToleranceMs,
            positive_keyword_matches,
            negative_keyword_matches,
            score_breakdown,
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
      return;
    }

    // 3) Keyword match (real)
    const match = await this.deps.matchService.match(input);
    log(`[LeadRadar-DEBUG] match result: matched=${match.matched} keywords=${JSON.stringify(match.matchedKeywords)}`);
    if (!match.matched) {
      negative_keyword_matches = match.debug?.negative_keyword_matches ?? [];
      positive_keyword_matches = match.debug?.positive_keyword_matches ?? [];
      if (match.reason === "negative_keyword") {
        log("[LeadRadar] skipped: negative keyword");
        skip_reason = "negative_match";
      } else {
        log("[LeadRadar] skipped: no match");
        // Guardrail: LeadRadar decisions must be based only on the currently processed message.
        // Even if the sender had historical matches, we must not create/update a lead for this message.
        skip_reason = "no_positive_match_on_current_message";
      }
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: true,
            source_monitored,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text: match.debug?.normalized_text ?? normalized_text,
            positive_keyword_matches: match.debug?.positive_keyword_matches_detailed?.map((x) => x.keyword) ?? [],
            negative_keyword_matches,
            history_messages_loaded_count,
            lead_created_from_message_id,
            score_breakdown,
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
      return;
    }
    log(`[LeadRadar] matched keywords: ${JSON.stringify(match.matchedKeywords)}`);
    positive_keyword_matches = match.matchedKeywords;

    // 4) Scoring (real)
    const scoring = await this.deps.scoringService.score({
      message: input,
      matchedKeywords: match.matchedKeywords,
      categories: match.categories
    });
    const score = typeof scoring === "number" ? scoring : scoring.score;
    score_breakdown = typeof scoring === "number" ? null : scoring.breakdown;
    log(`[LeadRadar-DEBUG] score=${score} threshold=${settings.min_score_threshold}`);

    // 5) Threshold check
    if (score < settings.min_score_threshold) {
      log("[LeadRadar] skipped: below threshold");
      threshold_passed = false;
      skip_reason = "below_threshold";
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: true,
            source_monitored,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text,
            positive_keyword_matches,
            negative_keyword_matches,
            score_breakdown: score_breakdown ?? { total: score },
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
      return;
    }
    threshold_passed = true;

    // 6) Deduplication (hard + soft)
    const hardDup = await this.deps.dedupeService.isHardDuplicate({ message: input });
    if (hardDup) {
      log("[LeadRadar] skipped: duplicate");
      dedupe_result = "hard";
      skip_reason = "duplicate_hard";
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: true,
            source_monitored,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text,
            positive_keyword_matches,
            negative_keyword_matches,
            score_breakdown: score_breakdown ?? null,
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
      return;
    }

    const softDup = await this.deps.dedupeService.isSoftDuplicate({
      message: input,
      dedupeWindowHours: settings.dedupe_window_hours
    });
    if (softDup) {
      log("[LeadRadar] skipped: soft duplicate");
      dedupe_result = "soft";
      skip_reason = "duplicate_soft";
      final_action = "skipped";
      if (traceEnabled) {
        log(
          `[LeadRadar-TRACE] ${JSON.stringify({
            messageId: input.messageId,
            leadradar_enabled: true,
            source_monitored,
            inbound_message: true,
            text_message: true,
            raw_text,
            normalized_text,
            positive_keyword_matches,
            negative_keyword_matches,
            score_breakdown: score_breakdown ?? null,
            threshold_passed,
            dedupe_result,
            final_action,
            skip_reason
          })}`
        );
      }
      return;
    }

    // 6b) Multi-chat merge: same Telegram user (strict id OR username), different chat, within window — no new lead
    const senderExternalId = input.senderId?.trim() || null;
    const usernameKey = normalizeUsernameForMerge(input.senderUsername);
    if (senderExternalId || usernameKey) {
      const windowMs = Math.max(1, this.deps.multiChatDedupeWindowHours) * 60 * 60 * 1000;
      const since = new Date(Date.now() - windowMs);
      const existing = await this.deps.leadRepo.findRecentLeadForMultiChatMerge({
        user_id: input.userId,
        telegram_account_id: input.telegramAccountId,
        telegram_user_id: senderExternalId,
        username_normalized: senderExternalId ? null : usernameKey,
        since
      });
      if (existing && existing.chat_id !== sourceChatId) {
        await this.deps.leadRepo.mergeMultiChatLead({
          lead_id: existing.id,
          user_id: input.userId,
          telegram_account_id: input.telegramAccountId,
          score_delta: this.deps.multiChatScoreBonus,
          source_chat_id: sourceChatId,
          source_type: source.chat_type ?? input.sourceType ?? null,
          related_channel_id: input.relatedChannelId ?? null,
          last_seen_at: input.date
        });
        log("[LeadRadar] Lead merged (multi-chat)");
        log("[LeadRadar] message processed");
        dedupe_result = "merged_existing_lead";
        skip_reason = "merged_existing_lead";
        final_action = "merged";
        if (traceEnabled) {
          log(
            `[LeadRadar-TRACE] ${JSON.stringify({
              messageId: input.messageId,
              leadradar_enabled: true,
              source_monitored,
              inbound_message: true,
              text_message: true,
              raw_text,
              normalized_text,
              positive_keyword_matches,
              negative_keyword_matches,
              score_breakdown: score_breakdown ?? null,
              threshold_passed,
              dedupe_result,
              final_action,
              skip_reason
            })}`
          );
        }
        return;
      }
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
        history_messages_loaded_count = contextBefore.length + contextAfter.length;
        log(`[LeadRadar] context loaded: ${contextBefore.length} before, ${contextAfter.length} after`);
      } catch {
        log("[LeadRadar] context skipped");
      }
    } else {
      log("[LeadRadar] context skipped");
    }

    // 7) Save lead
    lead_created_from_message_id = input.messageId;
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

    log("[LeadRadar] New lead created");
    log(`[LeadRadar-DEBUG] lead_created_from_message_id=${lead_created_from_message_id}`);
    log("[LeadRadar] message processed");
    final_action = "created";
    skip_reason = null;
    if (traceEnabled) {
      log(
        `[LeadRadar-TRACE] ${JSON.stringify({
          messageId: input.messageId,
          leadradar_enabled: true,
          source_monitored,
          inbound_message: true,
          text_message: true,
          raw_text,
          normalized_text,
          positive_keyword_matches,
          negative_keyword_matches,
          history_messages_loaded_count,
          lead_created_from_message_id,
          score_breakdown: score_breakdown ?? null,
          threshold_passed,
          dedupe_result,
          final_action,
          skip_reason
        })}`
      );
    }
  }
}

