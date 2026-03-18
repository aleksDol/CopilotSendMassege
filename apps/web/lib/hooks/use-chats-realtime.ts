"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/context";
import type { ConversationListResponse } from "@/lib/api/types";

function getRealtimeBaseUrl(): string {
  if (typeof window !== "undefined") {
    const env = (process.env.NEXT_PUBLIC_API_URL ?? "").trim();
    return env || `${window.location.origin}/api`;
  }
  return process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
}

export type NewMessagePayload = {
  conversationId: string;
  lastMessagePreview?: string | null;
  conversationTitle?: string | null;
  sentAt?: string | null;
};

type ParsedEvent = {
  type?: string;
  conversationId?: string;
  lastMessagePreview?: string | null;
  conversationTitle?: string | null;
  isOutbound?: boolean;
  sentAt?: string;
};

function handleMessageIngested(
  parsed: ParsedEvent,
  selectedIdRef: React.MutableRefObject<string | null>,
  onNewMessage: ((p: NewMessagePayload) => void) | undefined,
  queryClient: ReturnType<typeof useQueryClient>
) {
  const cid = parsed.conversationId;
  if (!cid) return;

  const isOutbound = parsed.isOutbound === true;
  const isSelected = selectedIdRef.current === cid;

  if (isSelected) {
    void queryClient.invalidateQueries({ queryKey: ["messages", cid] });
    void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", cid] });
    return;
  }

  if (isOutbound) return;

  let conversationFound = false;
  queryClient.setQueriesData<ConversationListResponse>({ queryKey: ["conversations"] }, (current) => {
    if (!current) {
      return current;
    }

    const nextItems = [...current.items];
    const index = nextItems.findIndex((item) => item.conversationId === cid);
    if (index === -1) {
      return current;
    }

    conversationFound = true;
    const currentItem = nextItems[index];
    const lastMessagePreview = parsed.lastMessagePreview ?? currentItem.lastMessagePreview;
    const lastMessageAt = parsed.sentAt ?? currentItem.lastMessageAt;

    nextItems[index] = {
      ...currentItem,
      title: parsed.conversationTitle ?? currentItem.title,
      lastMessagePreview,
      lastMessageAt,
      isWaitingForReply: true,
      unansweredClientMessageCount: Math.max(currentItem.unansweredClientMessageCount + 1, 1)
    };

    nextItems.sort((a, b) => {
      if (!a.lastMessageAt && !b.lastMessageAt) return 0;
      if (!a.lastMessageAt) return 1;
      if (!b.lastMessageAt) return -1;
      return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
    });

    return { ...current, items: nextItems };
  });

  if (!conversationFound) {
    // New chat: request full list to include freshly created conversation.
    void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  }

  onNewMessage?.({
    conversationId: cid,
    lastMessagePreview: parsed.lastMessagePreview ?? null,
    conversationTitle: parsed.conversationTitle ?? null,
    sentAt: parsed.sentAt ?? null
  });
}

export function useChatsRealtime(
  selectedConversationId: string | null,
  onNewMessageInOtherChat?: (payload: NewMessagePayload) => void
) {
  const { token, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const selectedIdRef = useRef<string | null>(selectedConversationId);
  const onNewMessageRef = useRef(onNewMessageInOtherChat);

  selectedIdRef.current = selectedConversationId;
  onNewMessageRef.current = onNewMessageInOtherChat;

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    const base = getRealtimeBaseUrl().replace(/\/$/, "");
    const url = new URL(base + "/realtime/events");
    url.searchParams.set("token", token);
    const source = new EventSource(url.toString());

    const handlerNamed = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as ParsedEvent;
        handleMessageIngested(parsed, selectedIdRef, onNewMessageRef.current, queryClient);
      } catch {
        // ignore parse errors
      }
    };

    source.addEventListener("message_ingested", handlerNamed);

    source.onerror = () => {};

    return () => {
      source.removeEventListener("message_ingested", handlerNamed);
      source.close();
    };
  }, [isAuthenticated, queryClient, token]);
}
