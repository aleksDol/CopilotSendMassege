import { Prisma, SuggestionStatus, SuggestionType, TaskStatus, TaskType, ChannelAccountStatus, ChannelType, TelegramLoginStatus } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { readThroughCache } from "../../lib/cache.js";
import { buildSupportedConversationWhere } from "../conversations/support.js";
import { buildCountMetric, buildRateMetricPp, buildTimeMetricMinutesLowerIsBetter, getSalesDashboardRanges, type SalesDashboardPeriod } from "./sales-utils.js";

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

export const getDashboardSales = async (
  app: FastifyInstance,
  params: { companyId: string; userId: string; period: SalesDashboardPeriod; timezone: string }
) => {
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
  const ranges = getSalesDashboardRanges({ period: params.period, timezone: params.timezone });

  const conversationWhereBase: Prisma.ConversationWhereInput = {
    companyId: params.companyId,
    isArchived: false,
    ...(activeChannelAccountId ? { channelAccountId: activeChannelAccountId } : {}),
    ...buildSupportedConversationWhere()
  };

  const leadConversationWhereBase: Prisma.ConversationWhereInput = {
    isArchived: false,
    ...(activeChannelAccountId ? { channelAccountId: activeChannelAccountId } : {})
  };

  const aiConversationWhereBase: Prisma.ConversationWhereInput = {
    isArchived: false,
    ...(activeChannelAccountId ? { channelAccountId: activeChannelAccountId } : {})
  };

  return readThroughCache(app, {
    keyParts: [
      "cache:dashboard",
      "sales",
      params.companyId,
      params.userId,
      activeChannelAccountId,
      params.period,
      ranges.current.startIso,
      ranges.current.endIso
    ],
    loader: async () => {
      const computeForRange = async (range: { start: Date; end: Date }) => {
        const [newLeads, avgReplyRows, contactedCount, repliedCount, ignoredCount, generatedSuggestions, wonCount] =
          await Promise.all([
          // 1) New leads: Lead.createdAt in selected period (CRM Lead table)
          app.prisma.lead.count({
            where: {
              companyId: params.companyId,
              createdAt: { gte: range.start, lt: range.end },
              conversation: leadConversationWhereBase
            }
          }),

          // 2) Average response time: INBOUND -> next OUTBOUND (pairing rule: OUTBOUND where previous is INBOUND)
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
              AND "prev_sentAt" >= ${range.start}
              AND "prev_sentAt" < ${range.end}
          `),

          // 3) Contacted in period: distinct conversations where we sent the FIRST OUTBOUND in this period.
          // This is the denominator for "Написали → ответили" and "Игнорируют" (cohort = "we wrote in this period").
          app.prisma
            .$queryRaw<{ count: bigint }[]>(Prisma.sql`
              WITH first_out AS (
                SELECT
                  m."conversationId",
                  MIN(m."sentAt") AS first_out_at
                FROM "Message" m
                JOIN "Conversation" c ON c."id" = m."conversationId"
                WHERE c."companyId" = ${params.companyId}::uuid
                  AND c."isArchived" = false
                  ${activeChannelAccountId
                    ? Prisma.sql`AND c."channelAccountId" = ${activeChannelAccountId}::uuid`
                    : Prisma.sql``}
                  AND m."direction" = 'OUTBOUND'
                  AND m."sentAt" >= ${range.start}
                  AND m."sentAt" < ${range.end}
                GROUP BY m."conversationId"
              )
              SELECT COUNT(*)::bigint AS count
              FROM first_out
            `)
            .then((rows) => Number(rows[0]?.count ?? 0)),

          // 4) Replied (CRM stage): of those we wrote to in this period, how many are now REPLIED.
          app.prisma
            .$queryRaw<{ count: bigint }[]>(Prisma.sql`
              WITH first_out AS (
                SELECT
                  m."conversationId",
                  MIN(m."sentAt") AS first_out_at
                FROM "Message" m
                JOIN "Conversation" c ON c."id" = m."conversationId"
                WHERE c."companyId" = ${params.companyId}::uuid
                  AND c."isArchived" = false
                  ${activeChannelAccountId
                    ? Prisma.sql`AND c."channelAccountId" = ${activeChannelAccountId}::uuid`
                    : Prisma.sql``}
                  AND m."direction" = 'OUTBOUND'
                  AND m."sentAt" >= ${range.start}
                  AND m."sentAt" < ${range.end}
                GROUP BY m."conversationId"
              )
              SELECT COUNT(*)::bigint AS count
              FROM first_out fo
              JOIN "Lead" l ON l."conversationId" = fo."conversationId"
              WHERE l."stage" = 'REPLIED'
            `)
            .then((rows) => Number(rows[0]?.count ?? 0)),

          // 5) Ignored (CRM stage): of those we wrote to in this period, how many are now IGNORED.
          app.prisma
            .$queryRaw<{ count: bigint }[]>(Prisma.sql`
              WITH first_out AS (
                SELECT
                  m."conversationId",
                  MIN(m."sentAt") AS first_out_at
                FROM "Message" m
                JOIN "Conversation" c ON c."id" = m."conversationId"
                WHERE c."companyId" = ${params.companyId}::uuid
                  AND c."isArchived" = false
                  ${activeChannelAccountId
                    ? Prisma.sql`AND c."channelAccountId" = ${activeChannelAccountId}::uuid`
                    : Prisma.sql``}
                  AND m."direction" = 'OUTBOUND'
                  AND m."sentAt" >= ${range.start}
                  AND m."sentAt" < ${range.end}
                GROUP BY m."conversationId"
              )
              SELECT COUNT(*)::bigint AS count
              FROM first_out fo
              JOIN "Lead" l ON l."conversationId" = fo."conversationId"
              WHERE l."stage" = 'IGNORED'
            `)
            .then((rows) => Number(rows[0]?.count ?? 0)),

          // 6) Generated AI suggestions: AiSuggestion.createdAt in selected period
          app.prisma.aiSuggestion.count({
            where: {
              companyId: params.companyId,
              suggestionType: SuggestionType.REPLY,
              createdAt: { gte: range.start, lt: range.end },
              conversation: aiConversationWhereBase
            }
          }),

          // 7) Won clients:
          // preferred: wonAt in period
          // fallback: wonAt is null but status=WON and updatedAt in period
          app.prisma.lead.count({
            where: {
              companyId: params.companyId,
              conversation: leadConversationWhereBase,
              OR: [
                { wonAt: { gte: range.start, lt: range.end } },
                { wonAt: null, status: "WON", updatedAt: { gte: range.start, lt: range.end } }
              ]
            }
          })
        ]);

        const avgReplySeconds = avgReplyRows[0]?.avg_reply_seconds ?? 0;
        const avgResponseTimeMinutes = avgReplySeconds ? Math.max(0, Math.round(avgReplySeconds / 60)) : 0;

        return {
          newLeads,
          avgResponseTimeMinutes,
          contactedCount,
          repliedCount,
          ignoredCount,
          generatedSuggestions,
          wonCount
        };
      };

      const [current, previous] = await Promise.all([
        computeForRange(ranges.current),
        computeForRange(ranges.previous)
      ]);

      const currentWriteToReplyRate =
        current.contactedCount > 0 ? (current.repliedCount / current.contactedCount) * 100 : 0;
      const previousWriteToReplyRate =
        previous.contactedCount > 0 ? (previous.repliedCount / previous.contactedCount) * 100 : 0;

      const currentReplyToWonRate = current.repliedCount > 0 ? (current.wonCount / current.repliedCount) * 100 : 0;
      const previousReplyToWonRate = previous.repliedCount > 0 ? (previous.wonCount / previous.repliedCount) * 100 : 0;

      return {
        period: params.period,
        timezone: ranges.timezone,
        currentRange: { start: ranges.current.startIso, end: ranges.current.endIso },
        previousRange: { start: ranges.previous.startIso, end: ranges.previous.endIso },
        metrics: {
          newLeads: buildCountMetric({ label: "Новые лиды", value: current.newLeads, previousValue: previous.newLeads }),
          avgResponseTimeMinutes: buildTimeMetricMinutesLowerIsBetter({
            label: "Среднее время ответа",
            value: current.avgResponseTimeMinutes,
            previousValue: previous.avgResponseTimeMinutes
          }),
          repliedCount: buildCountMetric({ label: "Ответили", value: current.repliedCount, previousValue: previous.repliedCount }),
          ignoredCount: buildCountMetric({ label: "Игнорируют", value: current.ignoredCount, previousValue: previous.ignoredCount }),
          generatedSuggestions: buildCountMetric({
            label: "Сгенерировано подсказок",
            value: current.generatedSuggestions,
            previousValue: previous.generatedSuggestions
          }),
          wonCount: buildCountMetric({ label: "Клиенты WON", value: current.wonCount, previousValue: previous.wonCount }),
          leadToReplyRate: buildRateMetricPp({
            label: "Написали → ответили",
            value: currentWriteToReplyRate,
            previousValue: previousWriteToReplyRate
          }),
          replyToWonRate: buildRateMetricPp({
            label: "Ответили → WON",
            value: currentReplyToWonRate,
            previousValue: previousReplyToWonRate
          })
        },
        comparisonLabelRu: ranges.comparisonLabelRu
      };
    }
  });
};
