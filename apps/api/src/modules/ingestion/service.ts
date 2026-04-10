import { ChannelType, MessageDirection, MessageType, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { invalidateCacheByPrefix } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";
import { realtimeHub } from "../../lib/realtime.js";
import { invalidateConversationCaches } from "../conversations/service.js";
import { isSupportedTelegramMessagePayload } from "../conversations/support.js";
import { upsertParticipant } from "../participants/service.js";
import { ConversationStateService } from "../state/service.js";
import type { LeadRadarMessageInput } from "../leadradar/types/ingestion.js";

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

const getRawString = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length ? value : null;
};

const getRawPreview = (raw: unknown, maxLen: number): string | null => {
  if (typeof raw !== "string") return null;
  const v = raw.trim();
  if (!v) return null;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
};

const normalizeUsername = (raw: unknown): string | null => {
  const v = getRawString(raw);
  if (!v) return null;
  return v.startsWith("@") ? v.slice(1) : v;
};

const toConversationType = (payload: MessageEventPayload): "DIRECT" | "GROUP" | "CHANNEL" => {
  const kind = payload.rawPayload?.dialogType;
  if (kind === "group") {
    return "GROUP";
  }
  if (kind === "channel") {
    return "CHANNEL";
  }
  if (kind === "channel_comment") {
    // Telegram "channel comments" are authored in the linked discussion group,
    // but we keep them as a special messageType while the conversation remains GROUP.
    return "GROUP";
  }
  return "DIRECT";
};

const toMessageDirection = (isOutgoing: boolean): MessageDirection =>
  isOutgoing ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;

const toMessageType = (payload: MessageEventPayload): MessageType => {
  if (payload.rawPayload?.dialogType === "channel_comment") {
    return MessageType.CHANNEL_COMMENT;
  }
  if (payload.hasAttachment) {
    return MessageType.MEDIA;
  }

  if (payload.text) {
    return MessageType.TEXT;
  }

  return MessageType.OTHER;
};

const canTriggerLeadRadar = (payload: MessageEventPayload): boolean => {
  if (payload.isOutgoing) {
    console.log("[LeadRadar-DEBUG] canTrigger: SKIP isOutgoing=true chatId=%s senderType=%s", payload.externalConversationId, payload.senderType);
    return false;
  }
  if (payload.senderType !== "user") {
    console.log("[LeadRadar-DEBUG] canTrigger: SKIP senderType=%s (not 'user') chatId=%s", payload.senderType, payload.externalConversationId);
    return false;
  }
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text.length) {
    console.log("[LeadRadar-DEBUG] canTrigger: SKIP empty text chatId=%s", payload.externalConversationId);
    return false;
  }
  console.log("[LeadRadar-DEBUG] canTrigger: OK chatId=%s text=%s", payload.externalConversationId, text.slice(0, 80));
  return true;
};

const toLeadRadarInput = (params: {
  userId: string;
  telegramAccountId: string;
  payload: MessageEventPayload;
  conversationTitle: string | null;
  participantUsername?: string | null;
  participantFullName?: string | null;
}): LeadRadarMessageInput => {
  const chatType = toConversationType(params.payload);
  return {
    userId: params.userId,
    telegramAccountId: params.telegramAccountId,
    chatId: params.payload.externalConversationId,
    chatTitle: params.conversationTitle ?? "",
    chatType,
    messageId: params.payload.externalMessageId,
    senderId: params.payload.senderExternalId ?? null,
    senderUsername: params.payload.senderUsername ?? params.participantUsername ?? null,
    senderDisplayName: params.payload.senderFullName ?? params.participantFullName ?? null,
    sourceType: getRawString(params.payload.rawPayload?.chatType) ?? null,
    relatedChannelId: getRawString(params.payload.rawPayload?.relatedChannelId) ?? null,
    relatedPostId: getRawString(params.payload.rawPayload?.relatedPostId) ?? null,
    contextPreview: getRawString(params.payload.rawPayload?.contextPreview) ?? null,
    text: (params.payload.text ?? "").trim(),
    date: new Date(params.payload.sentAt)
  };
};

const maybeMarkLeadContacted = async (app: FastifyInstance, params: { telegramAccountId: string; payload: MessageEventPayload }) => {
  // We only auto-update on the first outbound message in a DIRECT chat.
  if (!params.payload.isOutgoing) return;
  if (toConversationType(params.payload) !== "DIRECT") return;

  const peerExternalId = getRawString(params.payload.rawPayload?.peerExternalId);
  const peerUsername = normalizeUsername(params.payload.rawPayload?.peerUsername);
  if (!peerExternalId && !peerUsername) return;

  // Mark as contacted only once, and only if still "new".
  // Scope by telegramAccountId + chatId (direct dialog id) to avoid cross-chat collisions.
  const result = await app.prisma.leadRadarLead.updateMany({
    where: {
      telegramAccountId: params.telegramAccountId,
      chatId: params.payload.externalConversationId,
      status: "new",
      contactedAt: null,
      OR: [
        ...(peerExternalId ? [{ telegramUserId: peerExternalId }] : []),
        ...(peerUsername ? [{ username: peerUsername }] : [])
      ]
    },
    data: {
      status: "contacted",
      contactedAt: new Date(params.payload.sentAt)
    }
  });

  if (result.count > 0) {
    console.log(
      "[LeadRadar] auto-contacted lead: telegramAccountId=%s chatId=%s peerId=%s peerUsername=%s",
      params.telegramAccountId,
      params.payload.externalConversationId,
      peerExternalId,
      peerUsername
    );
  }
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

  const isSupported = isSupportedTelegramMessagePayload({
    senderType: payload.senderType,
    senderExternalId: payload.senderExternalId,
    senderUsername: payload.senderUsername,
    isOutgoing: payload.isOutgoing,
    rawPayload: payload.rawPayload,
    allowGroupIngestion: app.config.env.ENABLE_TG_GROUP_INGESTION
  });

  if (!isSupported) {
    console.log(
      "[LeadRadar-DEBUG] isSupportedTelegramMessagePayload=false → IGNORED chatId=%s dialogType=%s senderType=%s isOutgoing=%s allowGroup=%s senderUsername=%s",
      payload.externalConversationId,
      payload.rawPayload?.dialogType,
      payload.senderType,
      payload.isOutgoing,
      app.config.env.ENABLE_TG_GROUP_INGESTION,
      payload.senderUsername
    );
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

  let peerParticipantId: string | null = null;
  if (payload.isOutgoing) {
    const peerExternalId = getRawString(payload.rawPayload?.peerExternalId);
    if (peerExternalId) {
      const peerParticipant = await upsertParticipant({
        prisma: app.prisma,
        companyId,
        channelAccountId,
        externalParticipantId: peerExternalId,
        fullName: getRawString(payload.rawPayload?.peerFullName) ?? null,
        username: getRawString(payload.rawPayload?.peerUsername) ?? null,
        isSelf: false,
        metadata: {
          senderType: "user",
          isBot: Boolean(payload.rawPayload?.peerIsBot),
          isServiceDialog: Boolean(payload.rawPayload?.isServiceDialog)
        }
      });
      peerParticipantId = peerParticipant.id;
    }
  }

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

  if (peerParticipantId) {
    await app.prisma.conversationParticipant.upsert({
      where: {
        conversationId_participantId: {
          conversationId: conversation.id,
          participantId: peerParticipantId
        }
      },
      update: {},
      create: {
        conversationId: conversation.id,
        participantId: peerParticipantId
      }
    });
  }

  // Idempotency guard: worker sync and live-listener can deliver the same message.
  // If we already have this message, do NOT update conversation_state counters again.
  const existing = await app.prisma.message.findUnique({
    where: {
      conversationId_externalMessageId: {
        conversationId: conversation.id,
        externalMessageId: payload.externalMessageId
      }
    },
    select: {
      id: true,
      messageType: true,
      relatedChannelId: true,
      relatedPostId: true,
      contextPreview: true,
      dedupeKey: true
    }
  });
  if (existing) {
    await maybeMarkLeadContacted(app, { telegramAccountId: telegramAccount.id, payload });

    // If this is a Telegram "channel comment" delivered after the same message was already ingested
    // via a generic group sync, update the message with the richer channel-comment metadata.
    // This keeps the pipeline idempotent while allowing us to "upgrade" previously ingested rows.
    if (payload.rawPayload?.dialogType === "channel_comment") {
      const desiredType = toMessageType(payload);
      const relatedChannelId = getRawString(payload.rawPayload?.relatedChannelId) ?? null;
      const relatedPostId = getRawString(payload.rawPayload?.relatedPostId) ?? null;
      const contextPreview =
        getRawPreview(payload.rawPayload?.contextPreview, 240) ??
        ((payload.text ?? "").slice(0, 240) || null);
      const dedupeKey =
        getRawString(payload.rawPayload?.dedupeKey) ??
        `${payload.telegramAccountId}:${payload.externalConversationId}:${payload.externalMessageId}`;

      const needsUpgrade =
        existing.messageType !== desiredType ||
        existing.relatedChannelId !== relatedChannelId ||
        existing.relatedPostId !== relatedPostId ||
        (contextPreview && existing.contextPreview !== contextPreview) ||
        (dedupeKey && existing.dedupeKey !== dedupeKey);

      if (needsUpgrade) {
        await app.prisma.message.update({
          where: { id: existing.id },
          data: {
            messageType: desiredType,
            relatedChannelId,
            relatedPostId,
            contextPreview,
            dedupeKey,
            rawPayload: (payload.rawPayload as Prisma.InputJsonValue) ?? undefined
          }
        });
      }
    }

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

    // LeadRadar integration (non-blocking, inbound-only, gated by ENABLE_LEADRADAR).
    // Handle duplicate deliveries too: LeadRadar is idempotent via dedupe/unique keys.
    console.log("[LeadRadar-DEBUG] gate (dup-path): ENABLE_LEADRADAR=%s hasModule=%s", app.config.env.ENABLE_LEADRADAR, !!app.leadradar);
    if (app.config.env.ENABLE_LEADRADAR && app.leadradar && canTriggerLeadRadar(payload)) {
      const userId = telegramAccount.channelAccount.createdByUserId;
      console.log("[LeadRadar-DEBUG] userId=%s chatId=%s", userId, payload.externalConversationId);
      if (typeof userId === "string" && userId.length) {
        const conversationTitle = conversation.title ?? payload.conversationTitle ?? null;
        const input = toLeadRadarInput({
          userId,
          telegramAccountId: telegramAccount.id,
          payload,
          conversationTitle,
          participantUsername: participant.username,
          participantFullName: participant.fullName
        });
        console.log("[LeadRadar-DEBUG] calling processMessage chatId=%s text=%s", input.chatId, (input.text ?? "").slice(0, 80));

        void app.leadradar.services.ingestion.processMessage(input).catch((err: unknown) => {
          app.log.warn({ err }, "[LeadRadar] realtime ingestion failed");
        });
      }
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
      relatedChannelId: getRawString(payload.rawPayload?.relatedChannelId) ?? null,
      relatedPostId: getRawString(payload.rawPayload?.relatedPostId) ?? null,
      contextPreview:
        getRawPreview(payload.rawPayload?.contextPreview, 240) ??
        ((payload.text ?? "").slice(0, 240) || null),
      dedupeKey:
        getRawString(payload.rawPayload?.dedupeKey) ??
        `${payload.telegramAccountId}:${payload.externalConversationId}:${payload.externalMessageId}`,
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
      relatedChannelId: getRawString(payload.rawPayload?.relatedChannelId) ?? null,
      relatedPostId: getRawString(payload.rawPayload?.relatedPostId) ?? null,
      contextPreview:
        getRawPreview(payload.rawPayload?.contextPreview, 240) ??
        ((payload.text ?? "").slice(0, 240) || null),
      dedupeKey:
        getRawString(payload.rawPayload?.dedupeKey) ??
        `${payload.telegramAccountId}:${payload.externalConversationId}:${payload.externalMessageId}`,
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

  await maybeMarkLeadContacted(app, { telegramAccountId: telegramAccount.id, payload });

  // LeadRadar integration (non-blocking, inbound-only, gated by ENABLE_LEADRADAR).
  console.log("[LeadRadar-DEBUG] gate (new-msg): ENABLE_LEADRADAR=%s hasModule=%s", app.config.env.ENABLE_LEADRADAR, !!app.leadradar);
  if (app.config.env.ENABLE_LEADRADAR && app.leadradar && canTriggerLeadRadar(payload)) {
    const userId = telegramAccount.channelAccount.createdByUserId;
    console.log("[LeadRadar-DEBUG] userId=%s chatId=%s", userId, payload.externalConversationId);
    if (typeof userId === "string" && userId.length) {
      const input = toLeadRadarInput({
        userId,
        telegramAccountId: telegramAccount.id,
        payload,
        conversationTitle,
        participantUsername: participant.username,
        participantFullName: participant.fullName
      });
      console.log("[LeadRadar-DEBUG] calling processMessage chatId=%s text=%s", input.chatId, (input.text ?? "").slice(0, 80));

      void app.leadradar.services.ingestion.processMessage(input).catch((err: unknown) => {
        app.log.warn({ err }, "[LeadRadar] realtime ingestion failed");
      });
    }
  }

  return {
    ok: true,
    conversationId: conversation.id,
    messageId: message.id
  };
};
