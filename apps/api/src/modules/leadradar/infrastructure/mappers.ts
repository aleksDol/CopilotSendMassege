import type { Lead } from "../domain/entities/lead.js";
import type { LeadKeyword } from "../domain/entities/lead-keyword.js";
import type { LeadNegativeKeyword } from "../domain/entities/lead-negative-keyword.js";
import type { LeadSettings } from "../domain/entities/lead-settings.js";
import type { LeadSource } from "../domain/entities/lead-source.js";
import { LeadStatus as DomainLeadStatus } from "../domain/enums/lead-status.js";
import { LeadMatchType as DomainMatchType } from "../domain/enums/lead-match-type.js";
import { LeadCategory as DomainCategory } from "../domain/enums/lead-category.js";
import type { LeadRadarCategory, LeadRadarLeadStatus, LeadRadarMatchType } from "@prisma/client";

const toDomainLeadStatus = (status: LeadRadarLeadStatus): DomainLeadStatus => status as unknown as DomainLeadStatus;
const toDomainMatchType = (match: LeadRadarMatchType): DomainMatchType => match as unknown as DomainMatchType;
const toDomainCategory = (cat: LeadRadarCategory): DomainCategory => cat as unknown as DomainCategory;

export const leadRadarMappers = {
  lead: (row: {
    id: string;
    userId: string;
    telegramAccountId: string;
    telegramUserId: string | null;
    username: string | null;
    displayName: string | null;
    chatId: string;
    chatTitle: string | null;
    sourceType?: string | null;
    relatedPostId?: string | null;
    contextPreview?: string | null;
    messageId: string;
    messageText: string | null;
    messageDate: Date;
    matchedKeywords: unknown;
    score: number;
    leadType: string | null;
    status: LeadRadarLeadStatus;
    notes: string | null;
    contactedAt: Date | null;
    lastSeenAt?: Date | null;
    multiChatSourcesJson?: unknown;
    createdAt: Date;
    updatedAt: Date;
  }): Lead => ({
    id: row.id,
    user_id: row.userId,
    telegram_account_id: row.telegramAccountId,
    telegram_user_id: row.telegramUserId,
    username: row.username,
    display_name: row.displayName,
    chat_id: row.chatId,
    chat_title: row.chatTitle,
    source_type: row.sourceType ?? null,
    related_post_id: row.relatedPostId ?? null,
    context_preview: row.contextPreview ?? null,
    message_id: row.messageId,
    message_text: row.messageText,
    message_date: row.messageDate,
    matched_keywords_json: row.matchedKeywords,
    score: row.score,
    lead_type: row.leadType,
    status: toDomainLeadStatus(row.status),
    notes: row.notes,
    contacted_at: row.contactedAt,
    last_seen_at: row.lastSeenAt ?? null,
    multi_chat_sources_json: row.multiChatSourcesJson ?? [],
    created_at: row.createdAt,
    updated_at: row.updatedAt
  }),

  source: (row: {
    id: string;
    userId: string;
    telegramAccountId: string;
    telegramChatId: string;
    chatTitle: string | null;
    chatType: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LeadSource => ({
    id: row.id,
    user_id: row.userId,
    telegram_account_id: row.telegramAccountId,
    telegram_chat_id: row.telegramChatId,
    chat_title: row.chatTitle,
    chat_type: row.chatType,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  }),

  keyword: (row: {
    id: string;
    userId: string;
    telegramAccountId: string;
    keyword: string;
    matchType: LeadRadarMatchType;
    category: LeadRadarCategory;
    priority: number;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LeadKeyword => ({
    id: row.id,
    user_id: row.userId,
    telegram_account_id: row.telegramAccountId,
    keyword: row.keyword,
    match_type: toDomainMatchType(row.matchType),
    category: toDomainCategory(row.category),
    priority: row.priority,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  }),

  negativeKeyword: (row: {
    id: string;
    userId: string;
    telegramAccountId: string;
    phrase: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): LeadNegativeKeyword => ({
    id: row.id,
    user_id: row.userId,
    telegram_account_id: row.telegramAccountId,
    phrase: row.phrase,
    is_active: row.isActive,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  }),

  settings: (row: {
    id: string;
    userId: string;
    telegramAccountId: string;
    isEnabled: boolean;
    minScoreThreshold: number;
    storeContextEnabled: boolean;
    contextBeforeCount: number;
    contextAfterCount: number;
    dedupeWindowHours: number;
    createdAt: Date;
    updatedAt: Date;
  }): LeadSettings => ({
    id: row.id,
    user_id: row.userId,
    telegram_account_id: row.telegramAccountId,
    is_enabled: row.isEnabled,
    min_score_threshold: row.minScoreThreshold,
    store_context_enabled: row.storeContextEnabled,
    context_before_count: row.contextBeforeCount,
    context_after_count: row.contextAfterCount,
    dedupe_window_hours: row.dedupeWindowHours,
    created_at: row.createdAt,
    updated_at: row.updatedAt
  })
};

