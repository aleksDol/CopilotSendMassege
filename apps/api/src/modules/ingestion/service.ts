import { ChannelType, MessageDirection, MessageType, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { invalidateCacheByPrefix } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";
import { realtimeHub } from "../../lib/realtime.js";
import { invalidateConversationCaches } from "../conversations/service.js";
import { upsertParticipant } from "../participants/service.js";
import { ConversationStateService } from "../state/service.js";

type MessageEventPayload = {
  telegramAccountId: string;
  externalConversationId: string;
  externalMessageId: string;
  senderExternalId: string;
  senderType: "user" | "self" | "system";
  senderFullName?: string;
  senderUsername?: string;
  text?: string | null;
  sentAt: string;
  isOutgoing: boolean;
  replyToExternalMessageId?: string | null;
  rawPayload?: Record<string, unknown>;
  conversationTitle?: string | null;
  hasAttachment?: boolean;
};

const toConversationType = (payload: MessageEventPayload): "DIRECT" | "GROUP" | "CHANNEL" => {
  const kind = payload.rawPayload?.dialogType;
  if (kind === "group") {
    return "GROUP";
  }
  if (kind === "channel") {
    return "CHANNEL";
  }
  return "DIRECT";
};

const toMessageDirection = (isOutgoing: boolean): MessageDirection =>
  isOutgoing ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;

const toMessageType = (payload: MessageEventPayload): MessageType => {
  if (payload.hasAttachment) {
    return MessageType.MEDIA;
  }

  if (payload.text) {
    return MessageType.TEXT;
  }

  return MessageType.OTHER;
};

export const ingestMessageEvent = async (app: FastifyInstance, payload: MessageEventPayload) => {
  const telegramAccount = await app.prisma.telegramAccount.findUnique({
    where: { id: payload.telegramAccountId },
    include: { channelAccount: true }
  });

  if (!telegramAccount || telegramAccount.channelAccount.channelType !== ChannelType.TELEGRAM) {
    throw new AppError(404, "TELEGRAM_ACCOUNT_NOT_FOUND", "Telegram account not found");
  }

  const companyId = telegramAccount.channelAccount.companyId;
  const channelAccountId = telegramAccount.channelAccountId;

  const participant = await upsertParticipant({
    prisma: app.prisma,
    companyId,
    channelAccountId,
    externalParticipantId: payload.senderExternalId,
    fullName: payload.senderFullName ?? null,
    username: payload.senderUsername ?? null,
    isSelf: payload.senderType === "self",
    metadata: {
      senderType: payload.senderType
    }
  });

  const conversation = await app.prisma.conversation.upsert({
    where: {
      channelAccountId_externalConversationId: {
        channelAccountId,
        externalConversationId: payload.externalConversationId
      }
    },
    update: {
      title: payload.conversationTitle ?? undefined
    },
    create: {
      companyId,
      channelAccountId,
      externalConversationId: payload.externalConversationId,
      conversationType: toConversationType(payload),
      title: payload.conversationTitle ?? null
    }
  });

  await app.prisma.conversationParticipant.upsert({
    where: {
      conversationId_participantId: {
        conversationId: conversation.id,
        participantId: participant.id
      }
    },
    update: {},
    create: {
      conversationId: conversation.id,
      participantId: participant.id
    }
  });

  const message = await app.prisma.message.upsert({
    where: {
      conversationId_externalMessageId: {
        conversationId: conversation.id,
        externalMessageId: payload.externalMessageId
      }
    },
    update: {
      participantId: participant.id,
      direction: toMessageDirection(payload.isOutgoing),
      messageType: toMessageType(payload),
      text: payload.text ?? null,
      normalizedText: payload.text?.toLowerCase() ?? null,
      sentAt: new Date(payload.sentAt),
      replyToExternalMessageId: payload.replyToExternalMessageId ?? null,
      hasAttachment: payload.hasAttachment ?? false,
      rawPayload: (payload.rawPayload as Prisma.InputJsonValue) ?? undefined
    },
    create: {
      companyId,
      conversationId: conversation.id,
      participantId: participant.id,
      externalMessageId: payload.externalMessageId,
      replyToExternalMessageId: payload.replyToExternalMessageId ?? null,
      direction: toMessageDirection(payload.isOutgoing),
      messageType: toMessageType(payload),
      text: payload.text ?? null,
      normalizedText: payload.text?.toLowerCase() ?? null,
      sentAt: new Date(payload.sentAt),
      hasAttachment: payload.hasAttachment ?? false,
      rawPayload: (payload.rawPayload as Prisma.InputJsonValue) ?? undefined
    }
  });

  const stateService = new ConversationStateService(app.prisma);
  const preview = (payload.text ?? "").slice(0, 240) || null;

  if (payload.isOutgoing) {
    await stateService.updateFromOutboundMessage({
      conversationId: conversation.id,
      messageId: message.id,
      sentAt: message.sentAt,
      preview
    });
  } else {
    await stateService.updateFromInboundMessage({
      conversationId: conversation.id,
      messageId: message.id,
      sentAt: message.sentAt,
      preview
    });
  }

  await app.prisma.telegramAccount.update({
    where: { id: telegramAccount.id },
    data: {
      lastEventAt: new Date(),
      errorMessage: null
    }
  });

  await invalidateConversationCaches(app, companyId);
  await invalidateCacheByPrefix(app, `cache:dashboard:${companyId}:`);
  const conversationTitle = conversation.title ?? payload.conversationTitle ?? null;
  const lastMessagePreview = (payload.text ?? "").slice(0, 240) || null;
  realtimeHub.publish({
    type: "message_ingested",
    companyId,
    conversationId: conversation.id,
    messageId: message.id,
    sentAt: message.sentAt.toISOString(),
    lastMessagePreview: lastMessagePreview || undefined,
    conversationTitle: conversationTitle ?? undefined,
    isOutbound: payload.isOutgoing ?? false
  });

  return {
    ok: true,
    conversationId: conversation.id,
    messageId: message.id
  };
};
