import type { LeadStatus } from "../enums/lead-status.js";

export type Lead = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  telegram_user_id: string | null;
  username: string | null;
  display_name: string | null;
  chat_id: string;
  chat_title: string | null;
  message_id: string;
  message_text: string | null;
  message_date: Date;
  matched_keywords_json: unknown;
  score: number;
  lead_type: string | null;
  status: LeadStatus;
  notes: string | null;
  contacted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

