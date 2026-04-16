-- Commenting user state + channel exclusions (minus-list)

CREATE TABLE "CommentingUserState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CommentingUserState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentingUserState_userId_key" ON "CommentingUserState"("userId");
CREATE INDEX "CommentingUserState_userId_idx" ON "CommentingUserState"("userId");

ALTER TABLE "CommentingUserState"
  ADD CONSTRAINT "CommentingUserState_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "CommentingChannelExclusion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "channelId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "CommentingChannelExclusion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommentingChannelExclusion_userId_channelId_key"
  ON "CommentingChannelExclusion"("userId", "channelId");
CREATE INDEX "CommentingChannelExclusion_userId_idx" ON "CommentingChannelExclusion"("userId");
CREATE INDEX "CommentingChannelExclusion_channelId_idx" ON "CommentingChannelExclusion"("channelId");

ALTER TABLE "CommentingChannelExclusion"
  ADD CONSTRAINT "CommentingChannelExclusion_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

