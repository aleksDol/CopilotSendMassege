-- Commenting: per-channel activation to prevent backfill candidates

CREATE TABLE "CommentingChannelActivation" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "channelId" TEXT NOT NULL,
  "activatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CommentingChannelActivation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentingChannelActivation_userId_channelId_key"
  ON "CommentingChannelActivation"("userId", "channelId");

CREATE INDEX "CommentingChannelActivation_userId_idx"
  ON "CommentingChannelActivation"("userId");

CREATE INDEX "CommentingChannelActivation_channelId_idx"
  ON "CommentingChannelActivation"("channelId");

CREATE INDEX "CommentingChannelActivation_userId_activatedAt_idx"
  ON "CommentingChannelActivation"("userId", "activatedAt" DESC);

ALTER TABLE "CommentingChannelActivation"
  ADD CONSTRAINT "CommentingChannelActivation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

