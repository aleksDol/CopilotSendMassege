-- Add explicit trial lifecycle fields to subscriptions.
ALTER TABLE "Subscription"
ADD COLUMN "trialStartedAt" TIMESTAMP(3),
ADD COLUMN "trialEndsAt" TIMESTAMP(3);
