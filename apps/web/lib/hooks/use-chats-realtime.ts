"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/context";

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
};

type ParsedEvent = {
  type?: string;
  conversationId?: string;
  lastMessagePreview?: string | null;
  conversationTitle?: string | null;
  isOutbound?: boolean;
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

  // Refetch conversations list so new chats (first-time senders) appear in the panel immediately
  void queryClient.invalidateQueries({ queryKey: ["conversations"] });

  onNewMessage?.({
    conversationId: cid,
    lastMessagePreview: parsed.lastMessagePreview ?? null,
    conversationTitle: parsed.conversationTitle ?? null
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
