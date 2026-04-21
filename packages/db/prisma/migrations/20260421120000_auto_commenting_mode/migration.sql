-- Auto-commenting mode: user state + publish metadata for stats/guardrails

CREATE TYPE "CommentPublishSource" AS ENUM ('manual', 'auto');

ALTER TABLE "CommentCandidate"
  ADD COLUMN "publishedBy" "CommentPublishSource",
  ADD COLUMN "autoPublishAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "autoPublishLastErrorAt" TIMESTAMP(3),
  ADD COLUMN "autoPublishLastError" TEXT;

ALTER TABLE "CommentingUserState"
  ADD COLUMN "autoCommentingEnabled" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "autoCommentingEnabledAt" TIMESTAMP(3),
  ADD COLUMN "autoCommentingPausedUntil" TIMESTAMP(3),
  ADD COLUMN "autoCommentingPauseReason" TEXT,
  ADD COLUMN "autoCommentingConsecutiveErrors" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastAutoPublishedAt" TIMESTAMP(3);

CREATE INDEX "CommentCandidate_publishedBy_publishedAt_idx"
  ON "CommentCandidate"("publishedBy", "publishedAt" DESC);

CREATE INDEX "CommentCandidate_autoPublishLastErrorAt_idx"
  ON "CommentCandidate"("autoPublishLastErrorAt" DESC);

