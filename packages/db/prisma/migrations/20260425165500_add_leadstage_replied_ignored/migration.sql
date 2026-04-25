-- Extend LeadStage enum for unified CRM ↔ Chats sync.
-- Safe Postgres enum migration (forward-only).
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'REPLIED';
ALTER TYPE "LeadStage" ADD VALUE IF NOT EXISTS 'IGNORED';

