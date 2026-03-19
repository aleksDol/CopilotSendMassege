import { ChannelAccountStatus, ChannelType } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { decodeMessageCursor, encodeMessageCursor } from "../../lib/cursor.js";
import { AppError } from "../../lib/errors.js";
import { invalidateConversationCaches } from "../conversations/service.js";
import { TelegramWorkerClient } from "../../lib/telegram-worker-client.js";

const getWorkerClient = (app: FastifyInstance): TelegramWorkerClient =>
  new TelegramWorkerClient(
    app.config.env.TELEGRAM_WORKER_URL,
    app.config.env.INTERNAL_API_TOKEN,
    app.config.env.TELEGRAM_WORKER_TIMEOUT_MS
  );

export const listConversationMessages = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    userId: string;
    conversationId: string;
    before?: string;
    cursor?: string;
    limit: number;
  }
) => {
  const conversation = await app.prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      companyId: params.companyId,
      channelAccount: {
        status: { not: ChannelAccountStatus.DISCONNECTED },
        createdByUserId: params.userId
      }
    },
    select: { id: true }
  });

  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  const whereClause: {
    conversationId: string;
    sentAt?: { lt: Date };
    OR?: Array<{ sentAt: { lt: Date } } | { AND: Array<{ sentAt: Date } | { id: { lt: string } }> }>;
  } = {
    conversationId: params.conversationId
  };

  if (params.cursor) {
    let decoded;
    try {
      decoded = decodeMessageCursor(params.cursor);
    } catch {
      throw new AppError(400, "INVALID_CURSOR", "Invalid message cursor");
    }

    const cursorDate = new Date(decoded.sentAt);
    if (Number.isNaN(cursorDate.getTime())) {
      throw new AppError(400, "INVALID_CURSOR", "Invalid message cursor date");
    }

    whereClause.OR = [
      { sentAt: { lt: cursorDate } },
      {
        AND: [{ sentAt: cursorDate }, { id: { lt: decoded.id } }]
      }
    ];
  } else if (params.before) {
    whereClause.sentAt = { lt: new Date(params.before) };
  }

  const rows = await app.prisma.message.findMany({
    where: whereClause,
    include: {
      participant: {
        select: {
          id: true,
          fullName: true,
          username: true
        }
      }
    },
    orderBy: [{ sentAt: "desc" }, { id: "desc" }],
    take: params.limit + 1
  });

  const hasNext = rows.length > params.limit;
  const messages = rows.slice(0, params.limit);

  const nextCursor = hasNext
    ? encodeMessageCursor({
        sentAt: messages[messages.length - 1].sentAt.toISOString(),
        id: messages[messages.length - 1].id
      })
    : null;

  return {
    items: messages.map((message) => ({
      id: message.id,
      direction: message.direction.toLowerCase(),
      text: message.text,
      sentAt: message.sentAt,
      participant: message.participant
        ? {
            id: message.participant.id,
            fullName: message.participant.fullName,
            username: message.participant.username
          }
        : null
    })),
    nextCursor
  };
};

export const sendConversationMessage = async (
  app: FastifyInstance,
  params: {
    companyId: string;
    userId: string;
    conversationId: string;
    text: string;
  }
) => {
  const conversation = await app.prisma.conversation.findFirst({
    where: {
      id: params.conversationId,
      companyId: params.companyId,
      channelAccount: {
        channelType: ChannelType.TELEGRAM,
        status: { not: ChannelAccountStatus.DISCONNECTED },
        createdByUserId: params.userId
      }
    },
    include: {
      channelAccount: {
        include: {
          telegram: true
        }
      }
    }
  });

  if (!conversation) {
    throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
  }

  if (!conversation.channelAccount.telegram) {
    throw new AppError(400, "TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not connected");
  }

  const worker = getWorkerClient(app);
  const response = await worker.sendMessage({
    companyId: params.companyId,
    channelAccountId: conversation.channelAccountId,
    externalConversationId: conversation.externalConversationId,
    text: params.text
  });

  await invalidateConversationCaches(app, params.companyId);

  return {
    status: response.status,
    externalMessageId: (response.details as { externalMessageId?: string } | undefined)?.externalMessageId ?? null
  };
};
