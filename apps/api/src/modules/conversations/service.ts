import { ChannelAccountStatus, ChannelType, TelegramLoginStatus, type Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { invalidateCacheByPrefix, readThroughCache } from "../../lib/cache.js";
import { decodeConversationCursor, encodeConversationCursor } from "../../lib/cursor.js";
import { AppError } from "../../lib/errors.js";
import { buildSupportedConversationWhere } from "./support.js";

const TG_CONNECTED = "CONNECTED" as unknown as TelegramLoginStatus;
const TG_ERROR = "ERROR" as unknown as TelegramLoginStatus;

export const listConversations = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    userId: string;
    limit: number;
    cursor?: string;
    status?: "active" | "archived" | "all";
    assignedUserId?: string;
    waitingForReply?: boolean;
    leadStage?: string;
  }
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

  if (!activeTelegram) {
    return { items: [], nextCursor: null };
  }

  return readThroughCache(app, {
    keyParts: [
      "cache:conversations",
      params.companyId,
      params.userId,
      activeTelegram.channelAccountId,
      params.limit,
      params.cursor,
      params.status,
      params.assignedUserId,
      params.waitingForReply,
      params.leadStage
    ],
    loader: async () => {
      const conversationFilter: Prisma.ConversationWhereInput = {
        companyId: params.companyId,
        channelAccountId: activeTelegram.channelAccountId,
        ...buildSupportedConversationWhere(),
        channelAccount: {
          status: { not: ChannelAccountStatus.DISCONNECTED },
          createdByUserId: params.userId
        }
      };

      if (params.status && params.status !== "all") {
        conversationFilter.isArchived = params.status === "archived";
      }

      if (params.assignedUserId) {
        conversationFilter.assignedUserId = params.assignedUserId;
      }

      const where: Prisma.ConversationStateWhereInput = {
        conversation: conversationFilter,
        lastMessageAt: {
          not: null
        }
      };

      if (typeof params.waitingForReply === "boolean") {
        where.isWaitingForReply = params.waitingForReply;
      }

      if (params.leadStage) {
        where.leadStage = params.leadStage.toUpperCase() as never;
      }

      if (params.cursor) {
        const decoded = decodeConversationCursor(params.cursor);
        const cursorDate = new Date(decoded.lastMessageAt);

        if (Number.isNaN(cursorDate.getTime())) {
          throw new AppError(400, "INVALID_CURSOR", "Invalid cursor date");
        }

        where.OR = [
          {
            lastMessageAt: {
              lt: cursorDate
            }
          },
          {
            AND: [
              {
                lastMessageAt: cursorDate
              },
              {
                conversationId: {
                  lt: decoded.conversationId
                }
              }
            ]
          }
        ];
      }

      const rows = await app.prisma.conversationState.findMany({
        where,
        orderBy: [{ lastMessageAt: "desc" }, { conversationId: "desc" }],
        include: {
          conversation: {
            include: {
              channelAccount: true
            }
          }
        },
        take: params.limit + 1
      });

      const hasNext = rows.length > params.limit;
      const items = rows.slice(0, params.limit).map(mapConversationStateRowToListItem);

      const nextCursor = hasNext
        ? encodeConversationCursor({
            lastMessageAt: rows[params.limit - 1].lastMessageAt?.toISOString() ?? new Date(0).toISOString(),
            conversationId: rows[params.limit - 1].conversationId
          })
        : null;

      return {
        items,
        nextCursor
      };
    }
  });
};

export type ConversationListRow = Prisma.ConversationStateGetPayload<{
  include: { conversation: { include: { channelAccount: true } } };
}>;

export const mapConversationStateRowToListItem = (row: ConversationListRow) => ({
  conversationId: row.conversationId,
  title: row.conversation.title ?? row.conversation.channelAccount.displayName,
  lastMessagePreview: row.lastMessagePreview,
  lastMessageAt: row.lastMessageAt,
  leadStage: row.leadStage.toLowerCase(),
  leadTemperature: row.leadTemperature.toLowerCase(),
  unansweredClientMessageCount: row.unansweredClientMessageCount,
  isWaitingForReply: row.isWaitingForReply,
  assignedUserId: row.conversation.assignedUserId,
  isArchived: row.conversation.isArchived
});

export const invalidateConversationCaches = async (app: FastifyInstance, companyId: string) => {
  await invalidateCacheByPrefix(app, `cache:conversations:${companyId}:`);
};
