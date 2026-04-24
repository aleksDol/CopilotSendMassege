ALTER TABLE "lead_settings"
ADD COLUMN "author_profile_matching_enabled" BOOLEAN NOT NULL DEFAULT false;

UPDATE "lead_settings"
SET "author_profile_matching_enabled" = false
WHERE "author_profile_matching_enabled" IS DISTINCT FROM false;
