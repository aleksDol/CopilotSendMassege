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
import { enqueueLeadRadarJob } from "../leadradar/queue/leadradar-queue.js";
import { enqueueCommentingGenerationJob } from "../commenting/queue/commenting-queue.js";

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

const sanitizeDbString = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  // Postgres text/jsonb cannot contain NUL bytes; also guard against odd unicode edge-cases.
  // We prefer lossy sanitization over breaking ingestion.
  const withoutNul = raw.replaceAll("\u0000", "");
  return Buffer.from(withoutNul, "utf8").toString("utf8");
};

const getRawString = (raw: unknown): string | null => {
  const sanitized = sanitizeDbString(raw);
  if (sanitized == null) return null;
  const value = sanitized.trim();
  return value.length ? value : null;
};

const getRawPreview = (raw: unknown, maxLen: number): string | null => {
  const sanitized = sanitizeDbString(raw);
  if (sanitized == null) return null;
  const v = sanitized.trim();
  if (!v) return null;
  return v.length > maxLen ? v.slice(0, maxLen) : v;
};

const toSafePrismaJson = (raw: unknown): Prisma.InputJsonValue | undefined => {
  if (raw == null) return undefined;
  try {
    // Ensure payload is JSON-serializable and does not contain embedded NUL bytes.
    // If anything goes wrong, we prefer dropping rawPayload over breaking ingestion.
    const json = JSON.stringify(raw, (_k, v) => {
      if (typeof v === "string") {
        return v.replaceAll("\u0000", "");
      }
      return v;
    });
    return JSON.parse(json) as Prisma.InputJsonValue;
  } catch {
    return undefined;
  }
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
    return false;
  }
  if (payload.senderType !== "user") {
    return false;
  }
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text.length) {
    return false;
  }
  return true;
};

const canQueueCommentCandidate = (payload: MessageEventPayload): boolean => {
  if (toConversationType(payload) !== "CHANNEL") {
    return false;
  }

  // We can only publish comments when the channel has a linked discussion chat (Telegram "comments enabled").
  // telegram-worker provides this as rawPayload.linkedChatId for channel dialogs.
  const linkedChatId = getRawString(payload.rawPayload?.linkedChatId);
  if (!linkedChatId) {
    return false;
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  return text.length > 0;
};

const toCommentCandidateSource = (payload: MessageEventPayload): { channelId: string; postId: string } => ({
  channelId: getRawString(payload.rawPayload?.relatedChannelId) ?? payload.externalConversationId,
  postId: getRawString(payload.rawPayload?.relatedPostId) ?? payload.externalMessageId
});

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

const toLeadRadarJobPayload = (params: { telegramAccountId: string; payload: MessageEventPayload }) => {
  const relatedChannelId = getRawString(params.payload.rawPayload?.relatedChannelId);
  const relatedPostId = getRawString(params.payload.rawPayload?.relatedPostId);
  const sourceType = getRawString(params.payload.rawPayload?.chatType);

  const sourceHints =
    relatedChannelId || relatedPostId || sourceType
      ? {
          relatedChannelId: relatedChannelId ?? null,
          relatedPostId: relatedPostId ?? null,
          sourceType: sourceType ?? null
        }
      : undefined;

  return {
    telegramAccountId: params.telegramAccountId,
    chatId: params.payload.externalConversationId,
    externalMessageId: params.payload.externalMessageId,
    sentAt: params.payload.sentAt,
    ...(sourceHints ? { sourceHints } : {})
  };
};

const maybeMarkLeadContacted = async (
  app: FastifyInstance,
  params: { telegramAccountId: string; payload: MessageEventPayload }
) => {
  // We only auto-update on the first outbound message in a DIRECT chat.
  if (!params.payload.isOutgoing) return;
  if (toConversationType(params.payload) !== "DIRECT") return;

  const peerExternalId = getRawString(params.payload.rawPayload?.peerExternalId);
  const peerUsername = normalizeUsername(params.payload.rawPayload?.peerUsername);
  if (!peerExternalId && !peerUsername) return;

  // Mark as contacted only once, and only if still "new".
  // NOTE: leads can originate from groups/channels, while the first outbound message will be in DIRECT.
  // So we match by telegramUserId/username within the telegramAccount (not by chatId).
  const lead = await app.prisma.leadRadarLead.findFirst({
    where: {
      telegramAccountId: params.telegramAccountId,
      status: "new",
      contactedAt: null,
      OR: [
        ...(peerExternalId ? [{ telegramUserId: peerExternalId }] : []),
        ...(peerUsername ? [{ username: peerUsername }] : [])
      ]
    },
    orderBy: [{ createdAt: "desc" }]
  });

  if (!lead) return;

  const updated = await app.prisma.leadRadarLead.updateMany({
    where: { id: lead.id, status: "new", contactedAt: null },
    data: { status: "contacted", contactedAt: new Date(params.payload.sentAt) }
  });

  if (updated.count > 0) {
    console.log(
      "[LeadRadar] auto-contacted lead: telegramAccountId=%s leadId=%s peerId=%s peerUsername=%s",
      params.telegramAccountId,
      lead.id,
      peerExternalId,
      peerUsername
    );
  }
};

const maybeMarkLeadReplied = async (
  app: FastifyInstance,
  params: { telegramAccountId: string; payload: MessageEventPayload }
) => {
  // Only on first inbound message in a DIRECT chat.
  if (params.payload.isOutgoing) return;
  if (params.payload.senderType !== "user") return;
  if (toConversationType(params.payload) !== "DIRECT") return;

  const senderExternalId = getRawString(params.payload.senderExternalId);
  const senderUsername = normalizeUsername(params.payload.senderUsername);
  if (!senderExternalId && !senderUsername) return;

  // Promote contacted -> replied only once.
  const lead = await app.prisma.leadRadarLead.findFirst({
    where: {
      telegramAccountId: params.telegramAccountId,
      status: "contacted",
      OR: [
        ...(senderExternalId ? [{ telegramUserId: senderExternalId }] : []),
        ...(senderUsername ? [{ username: senderUsername }] : [])
      ]
    },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });
  if (!lead) return;

  const updated = await app.prisma.leadRadarLead.updateMany({
    where: { id: lead.id, status: "contacted" },
    data: { status: "replied" }
  });

  if (updated.count > 0) {
    console.log(
      "[LeadRadar] auto-replied lead: telegramAccountId=%s leadId=%s senderId=%s senderUsername=%s",
      params.telegramAccountId,
      lead.id,
      senderExternalId,
      senderUsername
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
      title: sanitizeDbString(payload.conversationTitle) ?? undefined
    },
    create: {
      companyId,
      channelAccountId,
      externalConversationId: payload.externalConversationId,
      conversationType: toConversationType(payload),
      title: sanitizeDbString(payload.conversationTitle)
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
    await maybeMarkLeadReplied(app, { telegramAccountId: telegramAccount.id, payload });

    // If this is a Telegram "channel comment" delivered after the same message was already ingested
    // via a generic group sync, update the message with the richer channel-comment metadata.
    // This keeps the pipeline idempotent while allowing us to "upgrade" previously ingested rows.
    if (payload.rawPayload?.dialogType === "channel_comment") {
      const desiredType = toMessageType(payload);
      const relatedChannelId = getRawString(payload.rawPayload?.relatedChannelId) ?? null;
      const relatedPostId = getRawString(payload.rawPayload?.relatedPostId) ?? null;
      const contextPreview =
        getRawPreview(payload.rawPayload?.contextPreview, 240) ??
        (sanitizeDbString(payload.text)?.slice(0, 240) || null);
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
        try {
          await app.prisma.message.update({
            where: { id: existing.id },
            data: {
              messageType: desiredType,
              relatedChannelId,
              relatedPostId,
              contextPreview,
              dedupeKey,
              rawPayload: toSafePrismaJson(payload.rawPayload)
            }
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.toLowerCase().includes("hex escape")) {
            app.log.warn(
              { err },
              "[Ingestion] message upgrade update failed due to encoding; retrying without optional fields"
            );
            // Fall back to a minimal upgrade to keep ingestion idempotent and avoid 500s.
            // We prefer losing optional metadata over breaking the whole pipeline.
            await app.prisma.message.update({
              where: { id: existing.id },
              data: {
                messageType: desiredType,
                relatedChannelId,
                relatedPostId,
                contextPreview: null,
                dedupeKey: null,
                rawPayload: undefined
              }
            });
          } else {
            throw err;
          }
        }
      }
    }

    // A duplicate event can happen (sync + live listener / retries).
    // Previously we returned early, which could permanently leave `conversation_state`
    // stale if the first attempt inserted the message but failed before state update.
    const sentAt = new Date(payload.sentAt);
    const preview = sanitizeDbString(payload.text)?.slice(0, 240) || null;
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
      const lastMessagePreview = sanitizeDbString(payload.text)?.slice(0, 240) || null;
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

    // LeadRadar trigger (async).
    // IMPORTANT: keep ingestion response fast; never await LeadRadar processing here.
    // Default rollout: ENABLE_LEADRADAR_QUEUE=false keeps legacy in-process behavior (if enabled).
    if (app.config.env.ENABLE_LEADRADAR && canTriggerLeadRadar(payload)) {
      if (app.config.env.ENABLE_LEADRADAR_QUEUE) {
        const jobPayload = toLeadRadarJobPayload({ telegramAccountId: telegramAccount.id, payload });
        void enqueueLeadRadarJob(app.config.env, jobPayload).then(
          ({ jobId }) => app.log.info({ jobId, chatId: jobPayload.chatId }, "[LeadRadar] job enqueued"),
          (err: unknown) => app.log.warn({ err }, "[LeadRadar] failed to enqueue job")
        );
      } else if (app.config.env.ENABLE_LEADRADAR_INGESTION_IN_API && app.leadradar) {
        // Legacy fallback: run in-process (non-blocking).
        const userId = telegramAccount.channelAccount.createdByUserId;
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

          void app.leadradar.services.ingestion.processMessage(input).catch((err: unknown) => {
            app.log.warn({ err }, "[LeadRadar] in-process ingestion failed");
          });
        }
      }
    }

    if (canQueueCommentCandidate(payload)) {
      const source = toCommentCandidateSource(payload);
      void enqueueCommentingGenerationJob(app.config.env, {
        telegramAccountId: telegramAccount.id,
        channelId: source.channelId,
        postId: source.postId
      }).then(
        ({ jobId, deduped }) =>
          app.log.info(
            { jobId, deduped, telegramAccountId: telegramAccount.id, channelId: source.channelId, postId: source.postId },
            "[Commenting] generation job enqueued"
          ),
        (err: unknown) => app.log.warn({ err }, "[Commenting] failed to enqueue generation job")
      );
    }

    return {
      ok: true,
      conversationId: conversation.id,
      messageId: existing.id
    };
  }

  const upsertArgs = {
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
      text: sanitizeDbString(payload.text),
      normalizedText: sanitizeDbString(payload.text)?.toLowerCase() ?? null,
      sentAt: new Date(payload.sentAt),
      replyToExternalMessageId: sanitizeDbString(payload.replyToExternalMessageId),
      hasAttachment: payload.hasAttachment ?? false,
      relatedChannelId: getRawString(payload.rawPayload?.relatedChannelId) ?? null,
      relatedPostId: getRawString(payload.rawPayload?.relatedPostId) ?? null,
      contextPreview:
        getRawPreview(payload.rawPayload?.contextPreview, 240) ??
        (sanitizeDbString(payload.text)?.slice(0, 240) || null),
      dedupeKey:
        getRawString(payload.rawPayload?.dedupeKey) ??
        `${payload.telegramAccountId}:${payload.externalConversationId}:${payload.externalMessageId}`,
      rawPayload: toSafePrismaJson(payload.rawPayload)
    },
    create: {
      companyId,
      conversationId: conversation.id,
      participantId: participant.id,
      externalMessageId: payload.externalMessageId,
      replyToExternalMessageId: sanitizeDbString(payload.replyToExternalMessageId),
      direction: toMessageDirection(payload.isOutgoing),
      messageType: toMessageType(payload),
      text: sanitizeDbString(payload.text),
      normalizedText: sanitizeDbString(payload.text)?.toLowerCase() ?? null,
      sentAt: new Date(payload.sentAt),
      hasAttachment: payload.hasAttachment ?? false,
      relatedChannelId: getRawString(payload.rawPayload?.relatedChannelId) ?? null,
      relatedPostId: getRawString(payload.rawPayload?.relatedPostId) ?? null,
      contextPreview:
        getRawPreview(payload.rawPayload?.contextPreview, 240) ??
        (sanitizeDbString(payload.text)?.slice(0, 240) || null),
      dedupeKey:
        getRawString(payload.rawPayload?.dedupeKey) ??
        `${payload.telegramAccountId}:${payload.externalConversationId}:${payload.externalMessageId}`,
      rawPayload: toSafePrismaJson(payload.rawPayload)
    }
  } satisfies Prisma.MessageUpsertArgs;

  let message;
  try {
    message = await app.prisma.message.upsert(upsertArgs);
  } catch (err) {
    // Safety net: if rawPayload breaks JSON transport/encoding, retry without it.
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.toLowerCase().includes("hex escape")) {
      app.log.warn({ err }, "[Ingestion] message upsert failed due to rawPayload encoding; retrying without rawPayload");
      try {
        message = await app.prisma.message.upsert({
          ...upsertArgs,
          update: { ...upsertArgs.update, rawPayload: undefined },
          create: { ...upsertArgs.create, rawPayload: undefined }
        });
      } catch (err2) {
        // If it still fails, fall back to a minimal row to avoid breaking ingestion entirely.
        // We prefer losing optional text/metadata over returning 500 and halting the pipeline.
        app.log.error({ err: err2 }, "[Ingestion] message upsert failed even without rawPayload; retrying minimal upsert");
        message = await app.prisma.message.upsert({
          where: upsertArgs.where,
          update: {
            participantId: upsertArgs.update.participantId ?? null,
            direction: upsertArgs.update.direction,
            messageType: upsertArgs.update.messageType,
            sentAt: upsertArgs.update.sentAt,
            hasAttachment: upsertArgs.update.hasAttachment ?? false,
            // Drop all optional strings/metadata.
            text: null,
            normalizedText: null,
            replyToExternalMessageId: null,
            relatedChannelId: null,
            relatedPostId: null,
            contextPreview: null,
            dedupeKey: null,
            rawPayload: undefined
          },
          create: {
            companyId: upsertArgs.create.companyId,
            conversationId: upsertArgs.create.conversationId,
            participantId: upsertArgs.create.participantId ?? null,
            externalMessageId: upsertArgs.create.externalMessageId,
            direction: upsertArgs.create.direction,
            messageType: upsertArgs.create.messageType,
            sentAt: upsertArgs.create.sentAt,
            hasAttachment: upsertArgs.create.hasAttachment ?? false,
            // Drop all optional strings/metadata.
            text: null,
            normalizedText: null,
            replyToExternalMessageId: null,
            relatedChannelId: null,
            relatedPostId: null,
            contextPreview: null,
            dedupeKey: null,
            rawPayload: undefined
          }
        });
      }
    } else {
      throw err;
    }
  }

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
  await maybeMarkLeadReplied(app, { telegramAccountId: telegramAccount.id, payload });

  // LeadRadar trigger (async).
  if (app.config.env.ENABLE_LEADRADAR && canTriggerLeadRadar(payload)) {
    if (app.config.env.ENABLE_LEADRADAR_QUEUE) {
      const jobPayload = toLeadRadarJobPayload({ telegramAccountId: telegramAccount.id, payload });
      void enqueueLeadRadarJob(app.config.env, jobPayload).then(
        ({ jobId }) => app.log.info({ jobId, chatId: jobPayload.chatId }, "[LeadRadar] job enqueued"),
        (err: unknown) => app.log.warn({ err }, "[LeadRadar] failed to enqueue job")
      );
    } else if (app.config.env.ENABLE_LEADRADAR_INGESTION_IN_API && app.leadradar) {
      const userId = telegramAccount.channelAccount.createdByUserId;
      if (typeof userId === "string" && userId.length) {
        const input = toLeadRadarInput({
          userId,
          telegramAccountId: telegramAccount.id,
          payload,
          conversationTitle,
          participantUsername: participant.username,
          participantFullName: participant.fullName
        });

        void app.leadradar.services.ingestion.processMessage(input).catch((err: unknown) => {
          app.log.warn({ err }, "[LeadRadar] in-process ingestion failed");
        });
      }
    }
  }

  if (canQueueCommentCandidate(payload)) {
    const source = toCommentCandidateSource(payload);
    void enqueueCommentingGenerationJob(app.config.env, {
      telegramAccountId: telegramAccount.id,
      channelId: source.channelId,
      postId: source.postId
    }).then(
      ({ jobId, deduped }) =>
        app.log.info(
          { jobId, deduped, telegramAccountId: telegramAccount.id, channelId: source.channelId, postId: source.postId },
          "[Commenting] generation job enqueued"
        ),
      (err: unknown) => app.log.warn({ err }, "[Commenting] failed to enqueue generation job")
    );
  }

  return {
    ok: true,
    conversationId: conversation.id,
    messageId: message.id
  };
};
