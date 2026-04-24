export type AuthorProfileCache = {
  id: string;
  telegram_account_id: string;
  telegram_user_id: string;
  username: string | null;
  display_name: string | null;
  bio: string | null;
  linked_channel_id: string | null;
  linked_channel_username: string | null;
  linked_channel_title: string | null;
  linked_channel_description: string | null;
  raw_profile_json: unknown | null;
  fetched_at: Date;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

