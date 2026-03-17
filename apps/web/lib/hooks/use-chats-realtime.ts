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
  const isOutbound = parsed.isOutbound === true;

  void queryClient.invalidateQueries({ queryKey: ["conversations"] });
  void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
  if (cid && selectedIdRef.current === cid) {
    void queryClient.invalidateQueries({ queryKey: ["messages", cid] });
    void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", cid] });
  }

  if (cid && onNewMessage && cid !== selectedIdRef.current && !isOutbound) {
    onNewMessage({
      conversationId: cid,
      lastMessagePreview: parsed.lastMessagePreview ?? null,
      conversationTitle: parsed.conversationTitle ?? null
    });
  }
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

    const handler = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as ParsedEvent;
        if (parsed.type !== "message_ingested") return;
        handleMessageIngested(parsed, selectedIdRef, onNewMessageRef.current, queryClient);
      } catch {
        // ignore parse errors
      }
    };

    const handlerNamed = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data) as ParsedEvent;
        handleMessageIngested(parsed, selectedIdRef, onNewMessageRef.current, queryClient);
      } catch {
        void queryClient.invalidateQueries({ queryKey: ["conversations"] });
        void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      }
    };

    source.addEventListener("message_ingested", handlerNamed);
    source.addEventListener("message", handler);

    source.onerror = () => {};

    return () => {
      source.removeEventListener("message_ingested", handlerNamed);
      source.removeEventListener("message", handler);
      source.close();
    };
  }, [isAuthenticated, queryClient, token]);
}
