-- Add role flags for Telegram channel usage.
ALTER TABLE "ChannelAccount"
ADD COLUMN "sendingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "parsingEnabled" BOOLEAN NOT NULL DEFAULT true;
