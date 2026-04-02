export type LeadSource = {
  id: string;
  user_id: string;
  telegram_account_id: string;
  telegram_chat_id: string;
  chat_title: string | null;
  chat_type: string | null;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
};

