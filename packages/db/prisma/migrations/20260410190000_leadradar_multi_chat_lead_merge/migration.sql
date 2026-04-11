-- LeadRadar: multi-chat lead merge (same Telegram user, strict id/username match only)
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "last_seen_at" TIMESTAMP(3);
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "multi_chat_sources_json" JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS "leads_telegram_account_id_tg_user_created_idx"
  ON "leads" ("telegram_account_id", "telegram_user_id", "created_at" DESC);
