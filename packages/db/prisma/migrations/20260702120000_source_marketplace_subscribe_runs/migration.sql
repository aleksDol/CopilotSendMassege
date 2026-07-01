-- Source Marketplace subscribe runs (batch progress for auto-join flow).

CREATE TYPE "SourceMarketplaceSubscribeRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

CREATE TABLE "source_marketplace_subscribe_runs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "telegram_account_id" UUID NOT NULL,
  "topic_ids" JSONB NOT NULL,
  "status" "SourceMarketplaceSubscribeRunStatus" NOT NULL DEFAULT 'pending',
  "total_count" INTEGER NOT NULL DEFAULT 0,
  "joined_count" INTEGER NOT NULL DEFAULT 0,
  "skipped_count" INTEGER NOT NULL DEFAULT 0,
  "failed_count" INTEGER NOT NULL DEFAULT 0,
  "last_error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "source_marketplace_subscribe_runs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "source_marketplace_subscribe_runs_user_created_idx"
  ON "source_marketplace_subscribe_runs"("user_id", "created_at" DESC);

CREATE INDEX "source_marketplace_subscribe_runs_tg_account_status_idx"
  ON "source_marketplace_subscribe_runs"("telegram_account_id", "status");

ALTER TABLE "source_marketplace_subscribe_runs"
  ADD CONSTRAINT "source_marketplace_subscribe_runs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "source_marketplace_subscribe_runs"
  ADD CONSTRAINT "source_marketplace_subscribe_runs_telegram_account_id_fkey"
  FOREIGN KEY ("telegram_account_id") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
