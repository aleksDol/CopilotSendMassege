-- CreateEnum
CREATE TYPE "LeadRadarLeadStatus" AS ENUM (
  'new',
  'reviewed',
  'hot',
  'contacted',
  'replied',
  'qualified',
  'won',
  'lost',
  'ignored',
  'spam'
);

CREATE TYPE "LeadRadarMatchType" AS ENUM ('contains', 'exact', 'regex');
CREATE TYPE "LeadRadarCategory" AS ENUM ('bot', 'website', 'ai', 'mvp', 'automation', 'general');

-- CreateTable
CREATE TABLE "lead_sources" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "telegram_chat_id" TEXT NOT NULL,
  "chat_title" TEXT,
  "chat_type" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_sources_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_keywords" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "keyword" TEXT NOT NULL,
  "match_type" "LeadRadarMatchType" NOT NULL,
  "category" "LeadRadarCategory" NOT NULL,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_keywords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_negative_keywords" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "phrase" TEXT NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_negative_keywords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "leads" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "telegram_user_id" TEXT,
  "username" TEXT,
  "display_name" TEXT,
  "chat_id" TEXT NOT NULL,
  "chat_title" TEXT,
  "message_id" TEXT NOT NULL,
  "message_text" TEXT,
  "message_date" TIMESTAMP(3) NOT NULL,
  "matched_keywords_json" JSONB NOT NULL,
  "score" INTEGER NOT NULL DEFAULT 0,
  "lead_type" TEXT,
  "status" "LeadRadarLeadStatus" NOT NULL DEFAULT 'new',
  "notes" TEXT,
  "contacted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_message_context" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL,
  "before_messages_json" JSONB NOT NULL,
  "after_messages_json" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_message_context_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "lead_id" UUID NOT NULL,
  "event_type" TEXT NOT NULL,
  "old_status" TEXT,
  "new_status" TEXT,
  "comment" TEXT,
  "created_by" UUID,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lead_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lead_settings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "is_enabled" BOOLEAN NOT NULL DEFAULT true,
  "min_score_threshold" INTEGER NOT NULL DEFAULT 0,
  "store_context_enabled" BOOLEAN NOT NULL DEFAULT false,
  "context_before_count" INTEGER NOT NULL DEFAULT 0,
  "context_after_count" INTEGER NOT NULL DEFAULT 0,
  "dedupe_window_hours" INTEGER NOT NULL DEFAULT 24,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "lead_settings_pkey" PRIMARY KEY ("id")
);

-- Uniques
CREATE UNIQUE INDEX "lead_sources_telegram_account_id_telegram_chat_id_key"
ON "lead_sources"("telegram_account_id", "telegram_chat_id");

CREATE UNIQUE INDEX "leads_telegram_account_id_chat_id_message_id_key"
ON "leads"("telegram_account_id", "chat_id", "message_id");

CREATE UNIQUE INDEX "lead_settings_telegram_account_id_key"
ON "lead_settings"("telegram_account_id");

CREATE UNIQUE INDEX "lead_message_context_lead_id_key"
ON "lead_message_context"("lead_id");

-- Indexes
CREATE INDEX "lead_sources_user_id_idx" ON "lead_sources"("user_id");
CREATE INDEX "lead_sources_telegram_account_id_idx" ON "lead_sources"("telegram_account_id");

CREATE INDEX "lead_keywords_telegram_account_id_idx" ON "lead_keywords"("telegram_account_id");
CREATE INDEX "lead_keywords_is_active_idx" ON "lead_keywords"("is_active");

CREATE INDEX "lead_negative_keywords_telegram_account_id_idx" ON "lead_negative_keywords"("telegram_account_id");
CREATE INDEX "lead_negative_keywords_is_active_idx" ON "lead_negative_keywords"("is_active");

CREATE INDEX "leads_telegram_account_id_status_idx" ON "leads"("telegram_account_id", "status");
CREATE INDEX "leads_telegram_account_id_chat_id_idx" ON "leads"("telegram_account_id", "chat_id");
CREATE INDEX "leads_telegram_account_id_username_idx" ON "leads"("telegram_account_id", "username");
CREATE INDEX "leads_telegram_account_id_created_at_desc_idx" ON "leads"("telegram_account_id", "created_at" DESC);

CREATE INDEX "lead_events_lead_id_idx" ON "lead_events"("lead_id");

CREATE INDEX "lead_settings_user_id_idx" ON "lead_settings"("user_id");

-- Foreign keys
ALTER TABLE "lead_sources"
ADD CONSTRAINT "lead_sources_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_sources"
ADD CONSTRAINT "lead_sources_telegram_account_id_fkey"
FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_keywords"
ADD CONSTRAINT "lead_keywords_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_keywords"
ADD CONSTRAINT "lead_keywords_telegram_account_id_fkey"
FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_negative_keywords"
ADD CONSTRAINT "lead_negative_keywords_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_negative_keywords"
ADD CONSTRAINT "lead_negative_keywords_telegram_account_id_fkey"
FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leads"
ADD CONSTRAINT "leads_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "leads"
ADD CONSTRAINT "leads_telegram_account_id_fkey"
FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_message_context"
ADD CONSTRAINT "lead_message_context_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_events"
ADD CONSTRAINT "lead_events_lead_id_fkey"
FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "lead_settings"
ADD CONSTRAINT "lead_settings_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "lead_settings"
ADD CONSTRAINT "lead_settings_telegram_account_id_fkey"
FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

