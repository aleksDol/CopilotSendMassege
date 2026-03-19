import { ChannelType, MessageDirection, MessageType, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { invalidateCacheByPrefix } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";
import { realtimeHub } from "../../lib/realtime.js";
import { invalidateConversationCaches } from "../conversations/service.js";
import { isSupportedTelegramMessagePayload } from "../conversations/support.js";
import { upsertParticipant } from "../participants/service.js";
import { ConversationStateService } from "../state/service.js";

type MessageEventPayload = {
  telegramAccountId: string;
  externalConversationId: string;
  externalMessageId: string;
  senderExternalId: string;
  senderType: "user" | "self" | "system";
  senderFullName?: string | null;
  senderUsername?: string | null;
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

  if (
    !isSupportedTelegramMessagePayload({
      senderType: payload.senderType,
      senderExternalId: payload.senderExternalId,
      senderUsername: payload.senderUsername,
      isOutgoing: payload.isOutgoing,
      rawPayload: payload.rawPayload
    })
  ) {
    await app.prisma.telegramAccount.update({
      where: { id: telegramAccount.id },
      data: {
        lastEventAt: new Date(),
        errorMessage: null
      }
    });
    return {
      ok: true,
      ignored: true
    };
  }

  const participant = await upsertParticipant({
    prisma: app.prisma,
    companyId,
    channelAccountId,
    externalParticipantId: payload.senderExternalId,
    fullName: payload.senderFullName ?? null,
    username: payload.senderUsername ?? null,
    isSelf: payload.senderType === "self",
    metadata: {
      senderType: payload.senderType,
      isBot: Boolean(payload.rawPayload?.peerIsBot) || (!payload.isOutgoing && Boolean(payload.senderUsername?.toLowerCase().endsWith("bot"))),
      isServiceDialog: Boolean(payload.rawPayload?.isServiceDialog) || payload.senderExternalId === "777000"
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

  // Idempotency guard: worker sync and live-listener can deliver the same message.
  // If we already have this message, do NOT update conversation_state counters again.
  const existing = await app.prisma.message.findUnique({
    where: {
      conversationId_externalMessageId: {
        conversationId: conversation.id,
        externalMessageId: payload.externalMessageId
      }
    },
    select: { id: true }
  });
  if (existing) {
    // A duplicate event can happen (sync + live listener / retries).
    // Previously we returned early, which could permanently leave `conversation_state`
    // stale if the first attempt inserted the message but failed before state update.
    const sentAt = new Date(payload.sentAt);
    const preview = (payload.text ?? "").slice(0, 240) || null;
    const currentState = await app.prisma.conversationState.findUnique({
      where: { conversationId: conversation.id },
      select: { lastMessageId: true, lastMessageAt: true }
    });

    const shouldApplyStateUpdate =
      // If state already points to this message, don't repeat inbound counter increments.
      currentState?.lastMessageId !== existing.id &&
      // If we have no state yet, we must initialize it.
      (!currentState?.lastMessageAt || sentAt.getTime() > currentState.lastMessageAt.getTime());

    await app.prisma.telegramAccount.update({
      where: { id: telegramAccount.id },
      data: {
        lastEventAt: new Date(),
        errorMessage: null
      }
    });

    if (shouldApplyStateUpdate) {
      const stateService = new ConversationStateService(app.prisma);
      if (payload.isOutgoing) {
        await stateService.updateFromOutboundMessage({
          conversationId: conversation.id,
          messageId: existing.id,
          sentAt,
          preview
        });
      } else {
        await stateService.updateFromInboundMessage({
          conversationId: conversation.id,
          messageId: existing.id,
          sentAt,
          preview
        });
      }

      // We changed `conversation_state`, so all conversation list caches must be invalidated.
      await invalidateConversationCaches(app, companyId);
      await invalidateCacheByPrefix(app, `cache:dashboard:${companyId}:`);

      const conversationTitle = conversation.title ?? payload.conversationTitle ?? null;
      const lastMessagePreview = (payload.text ?? "").slice(0, 240) || null;
      realtimeHub.publish({
        type: "message_ingested",
        companyId,
        channelAccountId: conversation.channelAccountId,
        conversationId: conversation.id,
        messageId: existing.id,
        sentAt: sentAt.toISOString(),
        lastMessagePreview: lastMessagePreview || undefined,
        conversationTitle: conversationTitle ?? undefined,
        isOutbound: payload.isOutgoing ?? false
      });
    } else if (currentState?.lastMessageId === existing.id) {
      // State seems already correct, but we still want to recover from cases where
      // the first attempt failed after updating state and before cache invalidation.
      await invalidateConversationCaches(app, companyId);
      await invalidateCacheByPrefix(app, `cache:dashboard:${companyId}:`);
    }

    return {
      ok: true,
      conversationId: conversation.id,
      messageId: existing.id
    };
  }

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
    channelAccountId: conversation.channelAccountId,
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
