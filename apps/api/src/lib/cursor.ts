export type ConversationListCursorPayload = {
  lastMessageAt: string;
  conversationId: string;
};

export type MessageCursorPayload = {
  sentAt: string;
  id: string;
};

export const encodeConversationCursor = (payload: ConversationListCursorPayload): string => {
  const raw = JSON.stringify(payload);
  return Buffer.from(raw, "utf-8").toString("base64url");
};

export const decodeConversationCursor = (cursor: string): ConversationListCursorPayload => {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as ConversationListCursorPayload;

    if (!parsed.lastMessageAt || !parsed.conversationId) {
      throw new Error("invalid cursor");
    }

    return parsed;
  } catch {
    throw new Error("Invalid cursor format");
  }
};

export const encodeMessageCursor = (payload: MessageCursorPayload): string => {
  const raw = JSON.stringify(payload);
  return Buffer.from(raw, "utf-8").toString("base64url");
};

export const decodeMessageCursor = (cursor: string): MessageCursorPayload => {
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf-8");
    const parsed = JSON.parse(raw) as MessageCursorPayload;

    if (!parsed.sentAt || !parsed.id) {
      throw new Error("invalid cursor");
    }

    return parsed;
  } catch {
    throw new Error("Invalid cursor format");
  }
};
