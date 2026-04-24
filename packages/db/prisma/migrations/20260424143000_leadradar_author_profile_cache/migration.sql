CREATE TABLE "lead_author_profile_cache" (
  "id" TEXT NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "telegram_user_id" TEXT NOT NULL,
  "username" TEXT,
  "display_name" TEXT,
  "bio" TEXT,
  "linked_channel_id" TEXT,
  "linked_channel_username" TEXT,
  "linked_channel_title" TEXT,
  "linked_channel_description" TEXT,
  "raw_profile_json" JSONB,
  "fetched_at" TIMESTAMP(3) NOT NULL,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "lead_author_profile_cache_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "lead_author_profile_cache"
ADD CONSTRAINT "lead_author_profile_cache_telegram_account_id_fkey"
FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE UNIQUE INDEX "lead_author_profile_cache_tg_acc_user_key"
ON "lead_author_profile_cache"("telegram_account_id", "telegram_user_id");

CREATE INDEX "lead_author_profile_cache_tg_acc_expires_idx"
ON "lead_author_profile_cache"("telegram_account_id", "expires_at");

CREATE INDEX "lead_author_profile_cache_username_idx"
ON "lead_author_profile_cache"("username");
