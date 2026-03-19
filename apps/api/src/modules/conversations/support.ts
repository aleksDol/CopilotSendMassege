import type { Prisma } from "@prisma/client";

const SERVICE_TELEGRAM_USER_IDS = new Set(["777000"]);

const normalizeDialogType = (raw: unknown): string | null => {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return value.length ? value : null;
};

const asBoolean = (raw: unknown): boolean | null => {
  if (typeof raw === "boolean") return raw;
  return null;
};

export const isSupportedTelegramMessagePayload = (payload: {
  senderType?: "user" | "self" | "system";
  senderExternalId?: string;
  senderUsername?: string | null;
  isOutgoing?: boolean;
  rawPayload?: Record<string, unknown>;
}) => {
  const dialogType = normalizeDialogType(payload.rawPayload?.dialogType);
  if (dialogType && dialogType !== "direct") {
    return false;
  }

  if (payload.senderType === "system") {
    return false;
  }

  if (payload.senderExternalId && SERVICE_TELEGRAM_USER_IDS.has(payload.senderExternalId)) {
    return false;
  }

  const senderUsername = (payload.senderUsername ?? "").trim().toLowerCase();
  if (!payload.isOutgoing && senderUsername.endsWith("bot")) {
    return false;
  }

  const peerIsBot = asBoolean(payload.rawPayload?.peerIsBot);
  if (peerIsBot === true) {
    return false;
  }

  const isServiceDialog = asBoolean(payload.rawPayload?.isServiceDialog);
  if (isServiceDialog === true) {
    return false;
  }

  return true;
};

export const buildSupportedConversationWhere = (): Prisma.ConversationWhereInput => ({
  conversationType: "DIRECT",
  participants: {
    some: {
      participant: {
        isSelf: false
      }
    },
    none: {
      participant: {
        isSelf: false,
        OR: [
          { externalParticipantId: { in: [...SERVICE_TELEGRAM_USER_IDS] } },
          { username: { endsWith: "bot", mode: "insensitive" } },
          { metadata: { path: ["isBot"], equals: true } },
          { metadata: { path: ["isServiceDialog"], equals: true } }
        ]
      }
    }
  }
});

