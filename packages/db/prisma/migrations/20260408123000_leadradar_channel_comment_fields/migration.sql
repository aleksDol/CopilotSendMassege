-- Add minimal LeadRadar fields for channel comments support.
-- Backwards compatible: nullable columns.

ALTER TABLE "leads"
  ADD COLUMN IF NOT EXISTS "source_type" TEXT,
  ADD COLUMN IF NOT EXISTS "related_post_id" TEXT,
  ADD COLUMN IF NOT EXISTS "context_preview" TEXT;

