import { Prisma, SuggestionStatus, SuggestionType, TaskStatus, TaskType, ChannelAccountStatus, ChannelType, TelegramLoginStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { readThroughCache } from "../../lib/cache.js";
import { buildSupportedConversationWhere } from "../conversations/support.js";

const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

export const getDashboardOverview = async (
  app: FastifyInstance,
  params: { companyId: string; userId: string; windowDays?: number }
) => {
  // We intentionally scope dashboard metrics to the "current active Telegram account"
  // for this user, to avoid mixing unrelated Telegram accounts inside the same company.
  const activeTelegram = await app.prisma.telegramAccount.findFirst({
    where: {
      loginStatus: { in: [TG_CONNECTED, TG_ERROR] },
      channelAccount: {
        companyId: params.companyId,
        channelType: ChannelType.TELEGRAM,
        createdByUserId: params.userId,
        status: { not: ChannelAccountStatus.DISCONNECTED }
      }
    },
    orderBy: { updatedAt: "desc" },
    select: { channelAccountId: true }
  });

  const activeChannelAccountId = activeTelegram?.channelAccountId ?? null;

  return readThroughCache(app, {
    // Cache must be isolated per company AND per user (and per active telegram channel if present).
    keyParts: ["cache:dashboard", params.companyId, params.userId, activeChannelAccountId, params.windowDays],
    loader: async () => {
      const windowDays = params.windowDays ?? app.config.env.DASHBOARD_ACTIVITY_WINDOW_DAYS;
      const windowStart = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
      const newLeadCutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const now = new Date();

      const conversationWhereBase: Prisma.ConversationWhereInput = {
        companyId: params.companyId,
        isArchived: false,
        ...(activeChannelAccountId ? { channelAccountId: activeChannelAccountId } : {}),
        ...buildSupportedConversationWhere()
      };

      const aiConversationWhereBase: Prisma.ConversationWhereInput = {
        isArchived: false,
        ...(activeChannelAccountId ? { channelAccountId: activeChannelAccountId } : {})
      };

      const leadConversationWhereBase: Prisma.ConversationWhereInput = {
        isArchived: false,
        ...(activeChannelAccountId ? { channelAccountId: activeChannelAccountId } : {})
      };

      // Note on metric meanings:
      // - `activeConversations` is "active in last windowDays" and must include only conversations
      //   where at least one client inbound message exists.
      // - `waitingForReply` is "realtime-like": it is true when we expect a reply (state-based).
      // - `newLeads` uses a strict rolling 24h cutoff based on the first inbound message per conversation.
      // - `avgReplyTimeSeconds` uses a pairing algorithm that avoids double-counting:
      //   we only pair an OUTBOUND message when the previous message in timeline is INBOUND.

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
        // 1) Active dialogs
        app.prisma.conversationState.count({
          where: {
            conversation: conversationWhereBase,
            lastMessageAt: { gte: windowStart },
            lastInboundAt: { not: null }
          }
        }),

        // 2) Waiting for reply (state-driven, no window cut)
        app.prisma.conversationState.count({
          where: {
            conversation: conversationWhereBase,
            isWaitingForReply: true,
            unansweredClientMessageCount: { gt: 0 }
          }
        }),

        // 3) Overdue follow-up tasks
        app.prisma.task.count({
          where: {
            companyId: params.companyId,
            taskType: TaskType.FOLLOW_UP,
            status: {
              in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS]
            },
            dueAt: {
              lt: now
            },
            ...(activeChannelAccountId ? { conversation: { channelAccountId: activeChannelAccountId } } : {})
          }
        }),

        // 4) New leads (strict rolling 24h)
        app.prisma.$queryRaw<{ count: bigint }[]>(Prisma.sql`
          SELECT COUNT(*)::bigint AS count
          FROM (
            SELECT m."conversationId"
            FROM "Message" m
            JOIN "Conversation" c ON c."id" = m."conversationId"
            WHERE c."companyId" = ${params.companyId}::uuid
              AND c."isArchived" = false
              AND m."direction" = 'INBOUND'
              ${activeChannelAccountId
                ? Prisma.sql`AND c."channelAccountId" = ${activeChannelAccountId}::uuid`
                : Prisma.sql``}
            GROUP BY m."conversationId"
            HAVING MIN(m."sentAt") >= ${newLeadCutoff}
          ) t
        `).then((rows) => Number(rows[0]?.count ?? 0)),

        // 5) Won leads
        app.prisma.lead.count({
          where: {
            companyId: params.companyId,
            status: "WON",
            conversation: leadConversationWhereBase,
            OR: [{ wonAt: { gte: windowStart } }, { wonAt: null }]
          }
        }),

        // 6) Lost leads
        app.prisma.lead.count({
          where: {
            companyId: params.companyId,
            status: "LOST",
            conversation: leadConversationWhereBase,
            OR: [{ lostAt: { gte: windowStart } }, { lostAt: null }]
          }
        }),

        // 7) Suggestions generated
        app.prisma.aiSuggestion.count({
          where: {
            companyId: params.companyId,
            suggestionType: SuggestionType.REPLY,
            createdAt: { gte: windowStart },
            conversation: aiConversationWhereBase
          }
        }),

        // 8) Suggestions accepted
        app.prisma.aiSuggestion.count({
          where: {
            companyId: params.companyId,
            suggestionType: SuggestionType.REPLY,
            status: SuggestionStatus.ACCEPTED,
            acceptedAt: { gte: windowStart },
            conversation: aiConversationWhereBase
          }
        }),

        // 10) Average reply time (seconds) between client INBOUND and our next first OUTBOUND
        // pairing rule:
        //   pair = OUTBOUND where previous message direction is INBOUND
        //   response interval = out.sentAt - in.sentAt (the previous INBOUND)
        //   only intervals with in.sentAt >= windowStart are included
        app.prisma.$queryRaw<{ avg_reply_seconds: number | null }[]>(Prisma.sql`
          WITH ordered AS (
            SELECT
              m."conversationId",
              m."id",
              m."direction",
              m."sentAt" AS "sentAt",
              LAG(m."sentAt") OVER (
                PARTITION BY m."conversationId"
                ORDER BY m."sentAt", m."id"
              ) AS "prev_sentAt",
              LAG(m."direction") OVER (
                PARTITION BY m."conversationId"
                ORDER BY m."sentAt", m."id"
              ) AS "prev_direction"
            FROM "Message" m
            JOIN "Conversation" c ON c."id" = m."conversationId"
            WHERE c."companyId" = ${params.companyId}::uuid
              AND c."isArchived" = false
              ${activeChannelAccountId
                ? Prisma.sql`AND c."channelAccountId" = ${activeChannelAccountId}::uuid`
                : Prisma.sql``}
          )
          SELECT AVG(EXTRACT(EPOCH FROM ("sentAt" - "prev_sentAt")))::float AS avg_reply_seconds
          FROM ordered
          WHERE "direction" = 'OUTBOUND'
            AND "prev_direction" = 'INBOUND'
            AND "prev_sentAt" IS NOT NULL
            AND "sentAt" >= "prev_sentAt"
            AND "prev_sentAt" >= ${windowStart}
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
