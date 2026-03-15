-- CreateEnum
CREATE TYPE "AiSuggestionMode" AS ENUM ('DEFAULT', 'SHORTER', 'MORE_FRIENDLY', 'MORE_SALES', 'HANDLE_OBJECTION');

-- Alter AiSuggestion
ALTER TABLE "AiSuggestion"
ADD COLUMN "mode" "AiSuggestionMode" NOT NULL DEFAULT 'DEFAULT';

-- Add index for cache/reuse lookups
CREATE INDEX "AiSuggestion_conversationId_mode_createdAt_idx"
ON "AiSuggestion"("conversationId", "mode", "createdAt" DESC);

-- Extend AiRunType enum
ALTER TYPE "AiRunType" ADD VALUE IF NOT EXISTS 'REPLY_GENERATION';
