"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth/context";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function useChatsRealtime(selectedConversationId: string | null) {
  const { token, isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      return;
    }

    const url = new URL("/realtime/events", API_URL);
    url.searchParams.set("token", token);

    const source = new EventSource(url.toString());

    const refresh = (conversationId?: string) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard-overview"] });
      if (conversationId && selectedConversationId === conversationId) {
        void queryClient.invalidateQueries({ queryKey: ["messages", conversationId] });
        void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", conversationId] });
      }
    };

    source.addEventListener("message_ingested", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as { conversationId?: string };
        refresh(parsed.conversationId);
      } catch {
        refresh();
      }
    });

    source.onerror = () => {
      // SSE reconnect is handled by EventSource automatically.
    };

    return () => {
      source.close();
    };
  }, [isAuthenticated, queryClient, selectedConversationId, token]);
}
