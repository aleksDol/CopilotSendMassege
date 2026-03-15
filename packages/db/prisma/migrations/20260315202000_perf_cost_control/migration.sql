-- Performance + cost control indexes
CREATE INDEX IF NOT EXISTS "AiSuggestion_conversationId_createdAt_idx"
ON "AiSuggestion" ("conversationId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "Lead_companyId_stage_idx"
ON "Lead" ("companyId", "stage");

CREATE INDEX IF NOT EXISTS "Task_companyId_status_idx"
ON "Task" ("companyId", "status");
