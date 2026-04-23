export type LeadSettings = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  is_enabled: boolean;
  min_score_threshold: number;
  store_context_enabled: boolean;
  context_before_count: number;
  context_after_count: number;
  dedupe_window_hours: number;
  cold_first_touch_playbook: string | null;
  created_at: Date;
  updated_at: Date;
};

