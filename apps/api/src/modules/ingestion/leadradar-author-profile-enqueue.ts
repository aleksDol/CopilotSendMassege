import type { Env } from "../../config/env.js";
import type { LeadRadarAuthorProfileCheckJob } from "../leadradar/queue/leadradar-queue.js";
import { enqueueAuthorProfileCheck } from "../leadradar/queue/leadradar-queue.js";

type LoggerLike = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
};

type IngestionMessagePayload = {
  senderExternalId?: string | null;
  senderUsername?: string | null;
  senderFullName?: string | null;
  senderType?: "user" | "self" | "system";
  externalConversationId: string;
  externalMessageId: string;
  sentAt?: string;
  conversationTitle?: string | null;
  rawPayload?: Record<string, unknown>;
};

const getRawString = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  return value.length ? value : null;
};

const normalizeUsername = (raw: unknown): string | null => {
  const value = getRawString(raw);
  if (!value) return null;
  return value.replace(/^@+/u, "");
};

export const isLikelyBotOrServiceSender = (payload: IngestionMessagePayload): boolean => {
  if (payload.senderType !== "user") return true;
  const senderExternalId = getRawString(payload.senderExternalId);
  if (senderExternalId === "777000") return true;
  if (payload.rawPayload?.isServiceDialog === true) return true;
  if (payload.rawPayload?.peerIsBot === true) return true;
  const username = String(payload.senderUsername ?? "").trim().toLowerCase();
  if (username.endsWith("bot")) return true;
  return false;
};

export const toAuthorProfileCheckPayload = (params: {
  userId: string;
  telegramAccountId: string;
  payload: IngestionMessagePayload;
}): LeadRadarAuthorProfileCheckJob => {
  return {
    userId: params.userId,
    telegramAccountId: params.telegramAccountId,
    telegramUserId: getRawString(params.payload.senderExternalId),
    sourceChatId: params.payload.externalConversationId,
    sourceChatTitle: getRawString(params.payload.conversationTitle),
    sourceMessageId: params.payload.externalMessageId,
    sourceMessageDate: getRawString(params.payload.sentAt),
    sourceType: getRawString(params.payload.rawPayload?.chatType),
    username: normalizeUsername(params.payload.senderUsername),
    displayName: getRawString(params.payload.senderFullName),
    contextPreview: getRawString(params.payload.rawPayload?.contextPreview),
    relatedPostId: getRawString(params.payload.rawPayload?.relatedPostId)
  };
};

export const enqueueAuthorProfileCheckBestEffort = (params: {
  env: Env;
  logger: LoggerLike;
  payload: LeadRadarAuthorProfileCheckJob;
  authorProfileMatchingEnabledForAccount: boolean;
  enqueueFn?: typeof enqueueAuthorProfileCheck;
}) => {
  if (!params.env.ENABLE_LEADRADAR_AUTHOR_PROFILE_MATCHING_ENABLED || !params.authorProfileMatchingEnabledForAccount) {
    params.logger.info(
      {
        event: "skipped_feature_disabled",
        telegramAccountId: params.payload.telegramAccountId,
        telegramUserId: params.payload.telegramUserId ?? null,
        username: params.payload.username ?? null,
        sourceChatId: params.payload.sourceChatId
      },
      "[LeadRadar] author-profile-check skipped by gate"
    );
    return;
  }
  const enqueueFn = params.enqueueFn ?? enqueueAuthorProfileCheck;

  void enqueueFn(params.env, params.payload).then(
    (result) => {
      if (!result.enqueued) {
        params.logger.info(
          {
            event: "skipped_no_identity",
            telegramAccountId: params.payload.telegramAccountId,
            telegramUserId: params.payload.telegramUserId ?? null,
            username: params.payload.username ?? null,
            sourceChatId: params.payload.sourceChatId
          },
          "[LeadRadar] author-profile-check skipped: missing identity"
        );
        return;
      }
      params.logger.info(
        {
          event: "enqueued",
          jobId: result.jobId,
          sourceChatId: params.payload.sourceChatId,
          telegramAccountId: params.payload.telegramAccountId,
          telegramUserId: params.payload.telegramUserId ?? null,
          username: params.payload.username ?? null
        },
        "[LeadRadar] author-profile-check job enqueued"
      );
    },
    (err: unknown) => {
      params.logger.warn({ err }, "[LeadRadar] failed to enqueue author-profile-check job");
    }
  );
};
