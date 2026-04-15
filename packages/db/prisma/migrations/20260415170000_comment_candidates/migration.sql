CREATE TYPE "CommentCandidateStatus" AS ENUM ('new', 'published', 'ignored');

CREATE TABLE "CommentCandidate" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "telegramAccountId" UUID NOT NULL,
  "channelId" TEXT NOT NULL,
  "postId" TEXT NOT NULL,
  "postText" TEXT NOT NULL,
  "aiComment" TEXT,
  "status" "CommentCandidateStatus" NOT NULL DEFAULT 'new',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "publishedAt" TIMESTAMP(3),

  CONSTRAINT "CommentCandidate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentCandidate_telegramAccountId_channelId_postId_key"
  ON "CommentCandidate"("telegramAccountId", "channelId", "postId");

CREATE INDEX "CommentCandidate_userId_createdAt_idx"
  ON "CommentCandidate"("userId", "createdAt" DESC);

CREATE INDEX "CommentCandidate_telegramAccountId_status_createdAt_idx"
  ON "CommentCandidate"("telegramAccountId", "status", "createdAt" DESC);

ALTER TABLE "CommentCandidate"
  ADD CONSTRAINT "CommentCandidate_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CommentCandidate"
  ADD CONSTRAINT "CommentCandidate_telegramAccountId_fkey"
  FOREIGN KEY ("telegramAccountId") REFERENCES "TelegramAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
