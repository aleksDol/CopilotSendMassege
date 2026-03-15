-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('FREE', 'PRO', 'TEAM', 'ENTERPRISE');
CREATE TYPE "UserRole" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');
CREATE TYPE "ChannelType" AS ENUM ('TELEGRAM', 'WHATSAPP', 'EMAIL', 'OTHER');
CREATE TYPE "ChannelAccountStatus" AS ENUM ('CONNECTING', 'ACTIVE', 'PAUSED', 'ERROR', 'DISCONNECTED');
CREATE TYPE "TelegramLoginStatus" AS ENUM ('DISCONNECTED', 'PENDING_2FA', 'AUTHORIZED', 'EXPIRED', 'ERROR');
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP', 'CHANNEL');
CREATE TYPE "ConversationParticipantRole" AS ENUM ('MEMBER', 'ADMIN', 'OWNER');
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND', 'SYSTEM');
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'MEDIA', 'SERVICE', 'OTHER');
CREATE TYPE "LeadStatus" AS ENUM ('NEW', 'OPEN', 'WON', 'LOST');
CREATE TYPE "LeadStage" AS ENUM ('NEW', 'CONTACTED', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST');
CREATE TYPE "LeadTemperature" AS ENUM ('COLD', 'WARM', 'HOT');
CREATE TYPE "LeadSource" AS ENUM ('TELEGRAM', 'IMPORT', 'MANUAL', 'API');
CREATE TYPE "LeadEventType" AS ENUM ('STATUS_CHANGED', 'STAGE_CHANGED', 'SCORE_CHANGED', 'OWNER_CHANGED', 'NOTE_ADDED');
CREATE TYPE "LeadEventSource" AS ENUM ('USER', 'SYSTEM', 'AI');
CREATE TYPE "SummaryKind" AS ENUM ('ROLLING', 'SNAPSHOT', 'HANDOFF');
CREATE TYPE "SuggestionType" AS ENUM ('REPLY', 'FOLLOW_UP', 'OBJECTION_HANDLING', 'REENGAGEMENT');
CREATE TYPE "SuggestionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'SENT', 'EXPIRED');
CREATE TYPE "AiRunType" AS ENUM ('SUGGESTION', 'SUMMARY', 'CLASSIFICATION', 'EXTRACTION', 'FOLLOW_UP');
CREATE TYPE "AiRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'CANCELED');
CREATE TYPE "TaskType" AS ENUM ('FOLLOW_UP', 'CALL', 'MESSAGE', 'REVIEW', 'MANUAL');
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "TaskSource" AS ENUM ('MANUAL', 'SYSTEM', 'AI');
CREATE TYPE "KnowledgeKind" AS ENUM ('FAQ', 'PRODUCT', 'POLICY', 'SCRIPT', 'OTHER');

-- CreateTable
CREATE TABLE "Company" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "plan" "Plan" NOT NULL DEFAULT 'FREE',
  "timezone" TEXT NOT NULL DEFAULT 'UTC',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "fullName" TEXT NOT NULL,
  "role" "UserRole" NOT NULL DEFAULT 'MEMBER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "channelType" "ChannelType" NOT NULL,
  "displayName" TEXT NOT NULL,
  "externalAccountId" TEXT NOT NULL,
  "status" "ChannelAccountStatus" NOT NULL DEFAULT 'ACTIVE',
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ChannelAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TelegramAccount" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "channelAccountId" UUID NOT NULL,
  "phone" TEXT,
  "telegramUserId" TEXT,
  "username" TEXT,
  "sessionDataEncrypted" TEXT,
  "apiDcId" INTEGER,
  "loginStatus" "TelegramLoginStatus" NOT NULL DEFAULT 'DISCONNECTED',
  "lastSyncAt" TIMESTAMP(3),
  "lastEventAt" TIMESTAMP(3),
  "errorMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "TelegramAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Participant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "channelAccountId" UUID NOT NULL,
  "externalParticipantId" TEXT NOT NULL,
  "username" TEXT,
  "fullName" TEXT,
  "firstName" TEXT,
  "lastName" TEXT,
  "phone" TEXT,
  "isSelf" BOOLEAN NOT NULL DEFAULT false,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Conversation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "channelAccountId" UUID NOT NULL,
  "externalConversationId" TEXT NOT NULL,
  "conversationType" "ConversationType" NOT NULL,
  "title" TEXT,
  "isArchived" BOOLEAN NOT NULL DEFAULT false,
  "assignedUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationParticipant" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "participantId" UUID NOT NULL,
  "role" "ConversationParticipantRole" NOT NULL DEFAULT 'MEMBER',
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leftAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Message" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "participantId" UUID,
  "externalMessageId" TEXT NOT NULL,
  "replyToExternalMessageId" TEXT,
  "direction" "MessageDirection" NOT NULL,
  "messageType" "MessageType" NOT NULL,
  "text" TEXT,
  "normalizedText" TEXT,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "editedAt" TIMESTAMP(3),
  "isDeleted" BOOLEAN NOT NULL DEFAULT false,
  "hasAttachment" BOOLEAN NOT NULL DEFAULT false,
  "rawPayload" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationState" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "lastMessageId" UUID,
  "lastMessageAt" TIMESTAMP(3),
  "lastMessagePreview" TEXT,
  "lastInboundAt" TIMESTAMP(3),
  "lastOutboundAt" TIMESTAMP(3),
  "unansweredClientMessageCount" INTEGER NOT NULL DEFAULT 0,
  "isWaitingForReply" BOOLEAN NOT NULL DEFAULT false,
  "leadStatus" "LeadStatus" NOT NULL DEFAULT 'NEW',
  "leadStage" "LeadStage" NOT NULL DEFAULT 'NEW',
  "leadScore" INTEGER NOT NULL DEFAULT 0,
  "leadTemperature" "LeadTemperature" NOT NULL DEFAULT 'COLD',
  "lastClientIntent" TEXT,
  "nextRecommendedAction" TEXT,
  "followUpDueAt" TIMESTAMP(3),
  "riskFlags" JSONB,
  "summaryVersion" INTEGER NOT NULL DEFAULT 0,
  "stateVersion" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConversationState_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Lead" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "ownerUserId" UUID,
  "status" "LeadStatus" NOT NULL DEFAULT 'OPEN',
  "stage" "LeadStage" NOT NULL DEFAULT 'NEW',
  "score" INTEGER NOT NULL DEFAULT 0,
  "source" "LeadSource" NOT NULL DEFAULT 'TELEGRAM',
  "estimatedValue" DECIMAL(12,2),
  "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
  "lostReason" TEXT,
  "wonAt" TIMESTAMP(3),
  "lostAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "LeadEvent" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "leadId" UUID NOT NULL,
  "eventType" "LeadEventType" NOT NULL,
  "oldValue" JSONB,
  "newValue" JSONB,
  "source" "LeadEventSource" NOT NULL DEFAULT 'SYSTEM',
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ConversationSummary" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "conversationId" UUID NOT NULL,
  "summaryText" TEXT NOT NULL,
  "coverageUntilMessageId" UUID,
  "summaryKind" "SummaryKind" NOT NULL DEFAULT 'ROLLING',
  "model" TEXT,
  "promptVersion" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationSummary_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiSuggestion" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "conversationId" UUID NOT NULL,
  "triggerMessageId" UUID,
  "suggestionType" "SuggestionType" NOT NULL,
  "status" "SuggestionStatus" NOT NULL DEFAULT 'PENDING',
  "model" TEXT,
  "promptHash" TEXT,
  "inputContext" JSONB,
  "suggestionText" TEXT NOT NULL,
  "confidence" DECIMAL(5,4),
  "createdForUserId" UUID,
  "acceptedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "editedBeforeSend" BOOLEAN NOT NULL DEFAULT false,
  "sentMessageId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSuggestion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AiRun" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "conversationId" UUID,
  "messageId" UUID,
  "runType" "AiRunType" NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "status" "AiRunStatus" NOT NULL DEFAULT 'QUEUED',
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "cachedTokens" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER,
  "costUsd" DECIMAL(10,6),
  "promptVersion" TEXT,
  "errorMessage" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Task" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "conversationId" UUID,
  "leadId" UUID,
  "assignedUserId" UUID,
  "taskType" "TaskType" NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
  "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
  "dueAt" TIMESTAMP(3),
  "source" "TaskSource" NOT NULL DEFAULT 'SYSTEM',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "KnowledgeItem" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "kind" "KnowledgeKind" NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "version" INTEGER NOT NULL DEFAULT 1,
  "createdByUserId" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "KnowledgeItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ReplyPolicy" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "companyId" UUID NOT NULL,
  "toneRules" JSONB,
  "pricingRules" JSONB,
  "discountRules" JSONB,
  "forbiddenPromises" JSONB,
  "forbiddenTopics" JSONB,
  "humanHandoffRules" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReplyPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_slug_key" ON "Company"("slug");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_companyId_idx" ON "User"("companyId");
CREATE INDEX "User_companyId_role_idx" ON "User"("companyId", "role");

CREATE UNIQUE INDEX "ChannelAccount_companyId_channelType_externalAccountId_key" ON "ChannelAccount"("companyId", "channelType", "externalAccountId");
CREATE INDEX "ChannelAccount_companyId_status_idx" ON "ChannelAccount"("companyId", "status");
CREATE INDEX "ChannelAccount_companyId_isPrimary_idx" ON "ChannelAccount"("companyId", "isPrimary");

CREATE UNIQUE INDEX "TelegramAccount_channelAccountId_key" ON "TelegramAccount"("channelAccountId");
CREATE INDEX "TelegramAccount_telegramUserId_idx" ON "TelegramAccount"("telegramUserId");
CREATE INDEX "TelegramAccount_loginStatus_idx" ON "TelegramAccount"("loginStatus");

CREATE UNIQUE INDEX "Participant_channelAccountId_externalParticipantId_key" ON "Participant"("channelAccountId", "externalParticipantId");
CREATE INDEX "Participant_companyId_idx" ON "Participant"("companyId");
CREATE INDEX "Participant_channelAccountId_idx" ON "Participant"("channelAccountId");

CREATE UNIQUE INDEX "Conversation_channelAccountId_externalConversationId_key" ON "Conversation"("channelAccountId", "externalConversationId");
CREATE INDEX "Conversation_companyId_isArchived_idx" ON "Conversation"("companyId", "isArchived");
CREATE INDEX "Conversation_companyId_updatedAt_idx" ON "Conversation"("companyId", "updatedAt" DESC);
CREATE INDEX "Conversation_assignedUserId_idx" ON "Conversation"("assignedUserId");

CREATE UNIQUE INDEX "ConversationParticipant_conversationId_participantId_key" ON "ConversationParticipant"("conversationId", "participantId");
CREATE INDEX "ConversationParticipant_participantId_idx" ON "ConversationParticipant"("participantId");

CREATE UNIQUE INDEX "Message_conversationId_externalMessageId_key" ON "Message"("conversationId", "externalMessageId");
CREATE INDEX "Message_conversationId_sentAt_idx" ON "Message"("conversationId", "sentAt" DESC);
CREATE INDEX "Message_companyId_sentAt_idx" ON "Message"("companyId", "sentAt" DESC);
CREATE INDEX "Message_participantId_idx" ON "Message"("participantId");

CREATE UNIQUE INDEX "ConversationState_conversationId_key" ON "ConversationState"("conversationId");
CREATE INDEX "ConversationState_lastMessageAt_idx" ON "ConversationState"("lastMessageAt" DESC);
CREATE INDEX "ConversationState_followUpDueAt_idx" ON "ConversationState"("followUpDueAt");
CREATE INDEX "ConversationState_leadStatus_leadStage_idx" ON "ConversationState"("leadStatus", "leadStage");

CREATE UNIQUE INDEX "Lead_conversationId_key" ON "Lead"("conversationId");
CREATE INDEX "Lead_companyId_status_stage_idx" ON "Lead"("companyId", "status", "stage");
CREATE INDEX "Lead_ownerUserId_idx" ON "Lead"("ownerUserId");

CREATE INDEX "LeadEvent_leadId_createdAt_idx" ON "LeadEvent"("leadId", "createdAt" DESC);
CREATE INDEX "LeadEvent_createdByUserId_idx" ON "LeadEvent"("createdByUserId");

CREATE INDEX "ConversationSummary_conversationId_createdAt_idx" ON "ConversationSummary"("conversationId", "createdAt" DESC);

CREATE INDEX "AiSuggestion_companyId_createdAt_idx" ON "AiSuggestion"("companyId", "createdAt" DESC);
CREATE INDEX "AiSuggestion_conversationId_status_createdAt_idx" ON "AiSuggestion"("conversationId", "status", "createdAt" DESC);
CREATE INDEX "AiSuggestion_createdForUserId_idx" ON "AiSuggestion"("createdForUserId");

CREATE INDEX "AiRun_companyId_createdAt_idx" ON "AiRun"("companyId", "createdAt" DESC);
CREATE INDEX "AiRun_conversationId_createdAt_idx" ON "AiRun"("conversationId", "createdAt" DESC);
CREATE INDEX "AiRun_messageId_idx" ON "AiRun"("messageId");

CREATE INDEX "Task_companyId_status_dueAt_idx" ON "Task"("companyId", "status", "dueAt");
CREATE INDEX "Task_assignedUserId_status_idx" ON "Task"("assignedUserId", "status");
CREATE INDEX "Task_leadId_idx" ON "Task"("leadId");
CREATE INDEX "Task_conversationId_idx" ON "Task"("conversationId");

CREATE INDEX "KnowledgeItem_companyId_kind_isActive_idx" ON "KnowledgeItem"("companyId", "kind", "isActive");
CREATE INDEX "KnowledgeItem_companyId_updatedAt_idx" ON "KnowledgeItem"("companyId", "updatedAt" DESC);

CREATE UNIQUE INDEX "ReplyPolicy_companyId_key" ON "ReplyPolicy"("companyId");

-- AddForeignKey
ALTER TABLE "User"
  ADD CONSTRAINT "User_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelAccount"
  ADD CONSTRAINT "ChannelAccount_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelAccount"
  ADD CONSTRAINT "ChannelAccount_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "TelegramAccount"
  ADD CONSTRAINT "TelegramAccount_channelAccountId_fkey"
  FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Participant"
  ADD CONSTRAINT "Participant_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Participant"
  ADD CONSTRAINT "Participant_channelAccountId_fkey"
  FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_channelAccountId_fkey"
  FOREIGN KEY ("channelAccountId") REFERENCES "ChannelAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Conversation"
  ADD CONSTRAINT "Conversation_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationParticipant"
  ADD CONSTRAINT "ConversationParticipant_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationParticipant"
  ADD CONSTRAINT "ConversationParticipant_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Message"
  ADD CONSTRAINT "Message_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Message"
  ADD CONSTRAINT "Message_participantId_fkey"
  FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationState"
  ADD CONSTRAINT "ConversationState_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationState"
  ADD CONSTRAINT "ConversationState_lastMessageId_fkey"
  FOREIGN KEY ("lastMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Lead"
  ADD CONSTRAINT "Lead_ownerUserId_fkey"
  FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "LeadEvent"
  ADD CONSTRAINT "LeadEvent_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeadEvent"
  ADD CONSTRAINT "LeadEvent_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConversationSummary"
  ADD CONSTRAINT "ConversationSummary_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationSummary"
  ADD CONSTRAINT "ConversationSummary_coverageUntilMessageId_fkey"
  FOREIGN KEY ("coverageUntilMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_triggerMessageId_fkey"
  FOREIGN KEY ("triggerMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_createdForUserId_fkey"
  FOREIGN KEY ("createdForUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiSuggestion"
  ADD CONSTRAINT "AiSuggestion_sentMessageId_fkey"
  FOREIGN KEY ("sentMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AiRun"
  ADD CONSTRAINT "AiRun_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AiRun"
  ADD CONSTRAINT "AiRun_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AiRun"
  ADD CONSTRAINT "AiRun_messageId_fkey"
  FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Task"
  ADD CONSTRAINT "Task_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Task"
  ADD CONSTRAINT "Task_assignedUserId_fkey"
  FOREIGN KEY ("assignedUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "KnowledgeItem"
  ADD CONSTRAINT "KnowledgeItem_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "KnowledgeItem"
  ADD CONSTRAINT "KnowledgeItem_createdByUserId_fkey"
  FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ReplyPolicy"
  ADD CONSTRAINT "ReplyPolicy_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
