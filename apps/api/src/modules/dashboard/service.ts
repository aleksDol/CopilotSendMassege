import { Prisma, SuggestionStatus, SuggestionType, TaskStatus, TaskType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { readThroughCache } from "../../lib/cache.js";

export const getDashboardOverview = async (
  app: FastifyInstance,
  params: { companyId: string; windowDays?: number }
) => {
  return readThroughCache(app, {
    keyParts: ["cache:dashboard", params.companyId, params.windowDays],
    loader: async () => {
      const windowDays = params.windowDays ?? app.config.env.DASHBOARD_ACTIVITY_WINDOW_DAYS;
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const now = new Date();

      const [
        activeConversations,
        waitingForReply,
        overdueFollowUps,
        newLeads,
        wonLeads,
        lostLeads,
        suggestionsGenerated,
        suggestionsAccepted,
        avgReplyRows
      ] = await Promise.all([
        app.prisma.conversationState.count({
          where: {
            conversation: { companyId: params.companyId },
            lastMessageAt: { gte: windowStart }
          }
        }),
        app.prisma.conversationState.count({
          where: {
            conversation: { companyId: params.companyId },
            isWaitingForReply: true
          }
        }),
        app.prisma.task.count({
          where: {
            companyId: params.companyId,
            taskType: TaskType.FOLLOW_UP,
            status: {
              in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS]
            },
            dueAt: {
              lt: now
            }
          }
        }),
        app.prisma.lead.count({
          where: {
            companyId: params.companyId,
            createdAt: { gte: windowStart },
            status: { in: ["NEW", "OPEN"] }
          }
        }),
        app.prisma.lead.count({
          where: {
            companyId: params.companyId,
            OR: [{ status: "WON" }, { wonAt: { gte: windowStart } }]
          }
        }),
        app.prisma.lead.count({
          where: {
            companyId: params.companyId,
            OR: [{ status: "LOST" }, { lostAt: { gte: windowStart } }]
          }
        }),
        app.prisma.aiSuggestion.count({
          where: {
            companyId: params.companyId,
            suggestionType: SuggestionType.REPLY,
            createdAt: { gte: windowStart }
          }
        }),
        app.prisma.aiSuggestion.count({
          where: {
            companyId: params.companyId,
            suggestionType: SuggestionType.REPLY,
            status: SuggestionStatus.ACCEPTED,
            acceptedAt: { gte: windowStart }
          }
        }),
        app.prisma.$queryRaw<{ avg_reply_seconds: number | null }[]>(Prisma.sql`
          SELECT AVG(EXTRACT(EPOCH FROM (out_msg."sentAt" - in_msg."sentAt")))::float AS avg_reply_seconds
          FROM "Message" in_msg
          JOIN "Conversation" c ON c."id" = in_msg."conversationId"
          JOIN LATERAL (
            SELECT m2."sentAt"
            FROM "Message" m2
            WHERE m2."conversationId" = in_msg."conversationId"
              AND m2."direction" = 'OUTBOUND'
              AND m2."sentAt" > in_msg."sentAt"
            ORDER BY m2."sentAt" ASC
            LIMIT 1
          ) out_msg ON true
          WHERE c."companyId" = ${params.companyId}::uuid
            AND in_msg."direction" = 'INBOUND'
            AND in_msg."sentAt" >= ${windowStart}
        `)
      ]);

      const acceptanceRate = suggestionsGenerated > 0 ? suggestionsAccepted / suggestionsGenerated : 0;
      const avgReplyTimeSeconds = avgReplyRows[0]?.avg_reply_seconds ? Math.round(avgReplyRows[0].avg_reply_seconds) : 0;

      return {
        activeConversations,
        waitingForReply,
        overdueFollowUps,
        newLeads,
        wonLeads,
        lostLeads,
        suggestionsGenerated,
        suggestionsAccepted,
        acceptanceRate,
        avgReplyTimeSeconds
      };
    }
  });
};
