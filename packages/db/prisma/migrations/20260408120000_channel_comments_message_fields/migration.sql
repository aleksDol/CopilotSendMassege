-- Add support for Telegram channel comments as a first-class message type.
-- Backwards compatible: all new fields are nullable.

DO $$
BEGIN
  -- Enum extension (safe on repeated runs).
  ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'CHANNEL_COMMENT';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Message"
  ADD COLUMN IF NOT EXISTS "related_channel_id" TEXT,
  ADD COLUMN IF NOT EXISTS "related_post_id" TEXT,
  ADD COLUMN IF NOT EXISTS "context_preview" TEXT,
  ADD COLUMN IF NOT EXISTS "dedupe_key" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "Message_dedupe_key_key" ON "Message" ("dedupe_key");

