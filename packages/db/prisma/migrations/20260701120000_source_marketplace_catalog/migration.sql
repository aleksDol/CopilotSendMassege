-- Source Marketplace: platform catalog of Telegram sources grouped by topics.
-- Independent from LeadRadar user sources (lead_sources).

CREATE TYPE "SourceMarketplaceTopicStatus" AS ENUM ('draft', 'active', 'hidden');

CREATE TYPE "SourceMarketplaceEntryStatus" AS ENUM ('active', 'paused', 'blocked', 'review');

CREATE TABLE "source_marketplace_topics" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "description" TEXT,
  "icon" TEXT NOT NULL DEFAULT '',
  "color" TEXT NOT NULL DEFAULT '#6366f1',
  "status" "SourceMarketplaceTopicStatus" NOT NULL DEFAULT 'draft',
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "source_marketplace_topics_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "source_marketplace_topics_slug_key" ON "source_marketplace_topics"("slug");
CREATE INDEX "source_marketplace_topics_status_sort_idx" ON "source_marketplace_topics"("status", "sort_order");

CREATE TABLE "source_marketplace_entries" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "title" TEXT NOT NULL,
  "telegram_username" TEXT,
  "telegram_chat_id" TEXT,
  "chat_type" TEXT,
  "status" "SourceMarketplaceEntryStatus" NOT NULL DEFAULT 'review',
  "note" TEXT,
  "last_checked_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "source_marketplace_entries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_marketplace_entries_status_idx" ON "source_marketplace_entries"("status");
CREATE INDEX "source_marketplace_entries_username_idx" ON "source_marketplace_entries"("telegram_username");

CREATE TABLE "source_marketplace_topic_entries" (
  "topic_id" UUID NOT NULL,
  "entry_id" UUID NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "source_marketplace_topic_entries_pkey" PRIMARY KEY ("topic_id", "entry_id")
);

CREATE INDEX "source_marketplace_topic_entries_entry_id_idx" ON "source_marketplace_topic_entries"("entry_id");

ALTER TABLE "source_marketplace_topic_entries"
  ADD CONSTRAINT "source_marketplace_topic_entries_topic_id_fkey"
  FOREIGN KEY ("topic_id") REFERENCES "source_marketplace_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "source_marketplace_topic_entries"
  ADD CONSTRAINT "source_marketplace_topic_entries_entry_id_fkey"
  FOREIGN KEY ("entry_id") REFERENCES "source_marketplace_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
