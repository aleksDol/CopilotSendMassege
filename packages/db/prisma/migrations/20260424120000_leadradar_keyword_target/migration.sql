ALTER TABLE "lead_keywords"
ADD COLUMN "target" TEXT NOT NULL DEFAULT 'message';

UPDATE "lead_keywords"
SET "target" = 'message'
WHERE "target" IS NULL OR btrim("target") = '';
