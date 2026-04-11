import type { LeadStatus } from "../domain/enums/lead-status.js";
import type { LeadCategory } from "../domain/enums/lead-category.js";
import type { LeadMatchType } from "../domain/enums/lead-match-type.js";

export type PaginationInput = {
  page?: number;
  limit?: number;
};

export type SortOrder = "asc" | "desc";
export type LeadSortBy = "created_at" | "message_date" | "score";

export type FindLeadFiltersInput = {
  user_id: string;
  telegram_account_id: string;

  status?: LeadStatus;
  chat_id?: string;
  keyword?: string;
  search?: string;
  date_from?: Date;
  date_to?: Date;

  sortBy?: LeadSortBy;
  sortOrder?: SortOrder;
} & PaginationInput;

export type FindLeadByIdInput = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  include?: {
    context?: boolean;
    events?: boolean;
  };
};

export type CreateLeadInput = {
  user_id: string;
  telegram_account_id: string;
  telegram_user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  chat_id: string;
  chat_title?: string | null;
  source_type?: string | null;
  related_post_id?: string | null;
  context_preview?: string | null;
  message_id: string;
  message_text?: string | null;
  message_date: Date;
  matched_keywords_json: unknown;
  score?: number;
  lead_type?: string | null;
  status: LeadStatus;
  notes?: string | null;
  contacted_at?: Date | null;

  context?: {
    before_messages_json: unknown;
    after_messages_json: unknown;
  } | null;

  initial_event?: {
    event_type: string;
    old_status?: string | null;
    new_status?: string | null;
    comment?: string | null;
    created_by?: string | null;
  } | null;
};

export type UpdateLeadStatusInput = {
  lead_id: string;
  user_id: string;
  telegram_account_id: string;
  status: LeadStatus;
  comment?: string | null;
  created_by?: string | null;
};

export type UpdateLeadNotesInput = {
  lead_id: string;
  user_id: string;
  telegram_account_id: string;
  notes: string | null;
  created_by?: string | null;
};

export type ExistsByMessageInput = {
  telegram_account_id: string;
  chat_id: string;
  message_id: string;
};

/** Same Telegram user only: match by telegram_user_id (exact) OR username (exact, case-insensitive). Never fuzzy. */
export type FindRecentLeadMultiChatInput = {
  user_id: string;
  telegram_account_id: string;
  /** If set, only this match path is used (priority). */
  telegram_user_id: string | null;
  /** Used only when telegram_user_id is null. Normalized (trim, no @, lower case). */
  username_normalized: string | null;
  since: Date;
};

export type MergeMultiChatLeadInput = {
  lead_id: string;
  user_id: string;
  telegram_account_id: string;
  score_delta: number;
  /** Current message source chat (may differ from lead.chat_id). */
  source_chat_id: string;
  source_type: string | null;
  related_channel_id: string | null;
  last_seen_at: Date;
};

export type ListAccountScopedInput = {
  user_id: string;
  telegram_account_id: string;
};

export type CreateLeadSourceInput = {
  user_id: string;
  telegram_account_id: string;
  telegram_chat_id: string;
  chat_title?: string | null;
  chat_type?: string | null;
  is_active?: boolean;
};

export type UpdateLeadSourceInput = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  patch: Partial<{
    telegram_chat_id: string;
    chat_title: string | null;
    chat_type: string | null;
    is_active: boolean;
  }>;
};

export type FindSourceByTelegramChatIdInput = {
  user_id: string;
  telegram_account_id: string;
  telegram_chat_id: string;
};

export type CreateLeadKeywordInput = {
  user_id: string;
  telegram_account_id: string;
  keyword: string;
  match_type: LeadMatchType;
  category: LeadCategory;
  priority?: number;
  is_active?: boolean;
};

export type UpdateLeadKeywordInput = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  patch: Partial<{
    keyword: string;
    match_type: LeadMatchType;
    category: LeadCategory;
    priority: number;
    is_active: boolean;
  }>;
};

export type CreateNegativeKeywordInput = {
  user_id: string;
  telegram_account_id: string;
  phrase: string;
  is_active?: boolean;
};

export type UpdateNegativeKeywordInput = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  patch: Partial<{
    phrase: string;
    is_active: boolean;
  }>;
};

export type UpdateLeadSettingsInput = {
  user_id: string;
  telegram_account_id: string;
  patch: Partial<{
    is_enabled: boolean;
    min_score_threshold: number;
    store_context_enabled: boolean;
    context_before_count: number;
    context_after_count: number;
    dedupe_window_hours: number;
  }>;
};

