import { randomUUID } from "node:crypto";
import type { CreateLeadInput } from "../types/repository-inputs.js";
import { LeadStatus } from "../domain/enums/lead-status.js";

/** Sentinel chat id for user-created leads (not from Telegram chat ids). */
export const MANUAL_LEAD_CHAT_ID = "__leadradar_manual__";

/** Distinguishes manual rows from parsed Telegram ingestion without schema migration. */
export const MANUAL_LEAD_SOURCE_TYPE = "manual";

export function normalizeManualLeadUsername(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t.replace(/^@+/u, "").toLowerCase();
}

export function buildManualLeadCreateInput(params: {
  user_id: string;
  telegram_account_id: string;
  display_name: string | null;
  username: string;
  comment: string;
}): CreateLeadInput {
  const now = new Date();
  return {
    user_id: params.user_id,
    telegram_account_id: params.telegram_account_id,
    telegram_user_id: null,
    username: params.username,
    display_name: params.display_name,
    chat_id: MANUAL_LEAD_CHAT_ID,
    chat_title: "Личка",
    source_type: MANUAL_LEAD_SOURCE_TYPE,
    related_post_id: null,
    context_preview: null,
    message_id: randomUUID(),
    message_text: params.comment,
    message_date: now,
    matched_keywords_json: {
      matched: false,
      matchedKeywords: [] as string[],
      categories: [] as string[]
    },
    score: 1,
    lead_type: null,
    status: LeadStatus.NEW,
    notes: null,
    contacted_at: null,
    context: null,
    initial_event: null
  };
}
