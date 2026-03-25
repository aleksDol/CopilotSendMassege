"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/context";
import { useTelegramAccount } from "@/lib/hooks/use-app-data";
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
  queryClient: ReturnType<typeof useQueryClient>,
  scope: string
) {
  const cid = parsed.conversationId;
  if (!cid) return;

  const isOutbound = parsed.isOutbound === true;
  const isSelected = selectedIdRef.current === cid;

  if (isSelected) {
    // Scope can become temporarily stale when switching Telegram accounts.
    // Invalidate by conversationId to guarantee messages/suggestions refresh for the dialog.
    void queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "messages" && q.queryKey[2] === cid
    });
    void queryClient.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "ai-suggestions" && q.queryKey[2] === cid
    });
    return;
  }

  if (isOutbound) {
    // Outbound in another/new chat should also refresh the list so outbound-first dialogs appear immediately.
    void queryClient.invalidateQueries({ queryKey: ["conversations", scope] });
    return;
  }

  let conversationFound = false;
  queryClient.setQueriesData<ConversationListResponse>({ queryKey: ["conversations", scope] }, (current) => {
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
    void queryClient.invalidateQueries({ queryKey: ["conversations", scope] });
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
  const { token, company, user, isAuthenticated } = useAuth();
  const telegram = useTelegramAccount();
  const queryClient = useQueryClient();
  const selectedIdRef = useRef<string | null>(selectedConversationId);
  const onNewMessageRef = useRef(onNewMessageInOtherChat);
  const channelAccountId = telegram.data?.channelAccountId ?? "";
  const scope = `${company?.id ?? ""}:${user?.id ?? ""}:${channelAccountId}`;

  selectedIdRef.current = selectedConversationId;
  onNewMessageRef.current = onNewMessageInOtherChat;

  useEffect(() => {
    const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
    const isTelegramConnected = telegramStatus === "connected" && Boolean(channelAccountId);

    if (!isAuthenticated || !token || !isTelegramConnected) {
      return;
    }

    const base = getRealtimeBaseUrl().replace(/\/$/, "");
    const controller = new AbortController();

    // IMPORTANT: don't put JWT into URL query (leaks via logs/history/referrers).
    // EventSource doesn't support headers, so use fetch() streaming SSE with Authorization header.
    const run = async () => {
      const resp = await fetch(base + "/realtime/events", {
        method: "GET",
        headers: {
          accept: "text/event-stream",
          authorization: `Bearer ${token}`
        },
        cache: "no-store",
        signal: controller.signal
      });

      if (!resp.ok || !resp.body) {
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();

      let buffer = "";
      let currentEvent: string | null = null;
      let currentData: string[] = [];

      const flush = () => {
        if (!currentEvent || currentData.length === 0) {
          currentEvent = null;
          currentData = [];
          return;
        }

        const dataStr = currentData.join("\n");

        if (currentEvent === "message_ingested") {
          try {
            const parsed = JSON.parse(dataStr) as ParsedEvent;
            handleMessageIngested(parsed, selectedIdRef, onNewMessageRef.current, queryClient, scope);
          } catch {
            // ignore parse errors
          }
        }

        currentEvent = null;
        currentData = [];
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const chunk = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);

          const lines = chunk.split("\n");
          for (const line of lines) {
            if (line.startsWith("event:")) {
              currentEvent = line.slice("event:".length).trim();
            } else if (line.startsWith("data:")) {
              currentData.push(line.slice("data:".length).trimStart());
            }
          }

          flush();
        }
      }
    };

    void run().catch(() => {
      // ignore
    });

    return () => {
      controller.abort();
    };
  }, [isAuthenticated, queryClient, token, scope, telegram.data, channelAccountId]);
}
