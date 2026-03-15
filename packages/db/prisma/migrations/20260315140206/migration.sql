-- AlterTable
ALTER TABLE "AiRun" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "AiSuggestion" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ChannelAccount" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Company" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Conversation" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ConversationParticipant" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ConversationState" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ConversationSummary" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "KnowledgeItem" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Lead" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LeadEvent" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Message" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Participant" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "ReplyPolicy" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Subscription" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Task" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TeamInvite" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "TelegramAccount" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "UsageRecord" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "id" DROP DEFAULT;
