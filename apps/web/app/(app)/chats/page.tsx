"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { ConversationList } from "@/components/chats/conversation-list";
import { MessageThread } from "@/components/chats/message-thread";
import { MessageComposer } from "@/components/chats/message-composer";
import { AiSuggestionPanel } from "@/components/chats/ai-suggestion-panel";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import {
  useAiSuggestions,
  useConversationMessages,
  useConversations,
  useSendMessageMutation,
  useSuggestReplyMutation
} from "@/lib/hooks/use-app-data";
import { useChatsRealtime, type NewMessagePayload } from "@/lib/hooks/use-chats-realtime";
import { aiApi } from "@/lib/api/ai";
import { useAuth } from "@/lib/auth/context";

const CONVERSATIONS_POLL_INTERVAL_MS = 8_000;
const MESSAGES_POLL_INTERVAL_MS = 3_000;

export default function ChatsPage() {
  const params = useSearchParams();
  const initialWaiting = params.get("waitingForReply") ?? "all";
  const initialConversation = params.get("conversationId");

  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({
    search: "",
    waitingForReply: initialWaiting === "true" || initialWaiting === "false" ? initialWaiting : "all",
    leadStage: "all"
  });

  const [selectedConversationId, setSelectedConversationIdState] = useState<string | null>(initialConversation);
  const [unreadByConversationId, setUnreadByConversationId] = useState<
    Record<string, { lastMessagePreview?: string | null; conversationTitle?: string | null }>
  >({});

  const setSelectedConversationId = useCallback((id: string | null) => {
    setSelectedConversationIdState(id);
    if (id) {
      setUnreadByConversationId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, []);

  const handleNewMessageInOtherChat = useCallback((payload: NewMessagePayload) => {
    setUnreadByConversationId((prev) => ({
      ...prev,
      [payload.conversationId]: {
        lastMessagePreview: payload.lastMessagePreview ?? null,
        conversationTitle: payload.conversationTitle ?? null
      }
    }));
  }, []);

  const [composerText, setComposerText] = useState("");
  const [lastSuggestionContext, setLastSuggestionContext] = useState<{
    leadStage: string | null;
    leadTemperature: string | null;
    lastClientIntent: string | null;
  } | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const conversations = useConversations({
    waitingForReply: filters.waitingForReply === "all" ? undefined : filters.waitingForReply === "true",
    leadStage: filters.leadStage === "all" ? undefined : filters.leadStage,
    limit: 50,
    refetchInterval: CONVERSATIONS_POLL_INTERVAL_MS
  });

  // IMPORTANT: avoid auto-switching the selected chat when the list refetches/reorders.
  // We only set the initial selection once (see effect below).
  const selectedId = selectedConversationId ?? null;

  useChatsRealtime(selectedId, handleNewMessageInOtherChat);

  useEffect(() => {
    if (!selectedConversationId && conversations.data?.items.length) {
      setSelectedConversationId(conversations.data.items[0].conversationId);
    }
  }, [selectedConversationId, conversations.data]);

  const messages = useConversationMessages(selectedId ?? undefined, 50, MESSAGES_POLL_INTERVAL_MS);
  const suggestions = useAiSuggestions(selectedId ?? undefined);

  const sendMessage = useSendMessageMutation(selectedId ?? "");
  const suggestMutation = useSuggestReplyMutation(selectedId ?? "");

  const acceptMutation = useMutation({
    mutationFn: (suggestionId: string) => aiApi.accept(token ?? "", suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", selectedId] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => aiApi.reject(token ?? "", suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", selectedId] });
    }
  });

  const latestSuggestion = useMemo(() => suggestions.data?.items[0] ?? null, [suggestions.data]);

  const handleSend = async (text: string) => {
    if (!selectedId?.trim()) return;
    setSendError(null);
    try {
      await sendMessage.mutateAsync(text);
      setComposerText("");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to send message";
      setSendError(message);
    }
  };

  if (conversations.isLoading) {
    return <LoadingState label="Loading conversations..." />;
  }

  if (!conversations.data || conversations.data.items.length === 0) {
    return <EmptyState title="No conversations yet" description="Connect Telegram and run sync to populate inbox." />;
  }

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-4 md:p-6">
      <aside className="flex h-[320px] min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card lg:h-full lg:w-[300px]">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Chats</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <ConversationList
            items={conversations.data.items}
            selectedId={selectedId}
            onSelect={setSelectedConversationId}
            filters={filters}
            onFiltersChange={setFilters}
            unreadByConversationId={unreadByConversationId}
          />
        </div>
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          <MessageThread items={messages.data?.items ?? []} />
        </div>
        <MessageComposer
          value={composerText}
          onChange={(v) => {
            setComposerText(v);
            if (sendError) setSendError(null);
          }}
          isSending={sendMessage.isPending}
          sendDisabled={!selectedId?.trim()}
          onSend={handleSend}
          sendError={sendError}
        />
      </section>

      <aside className="hidden h-full min-h-0 w-[360px] shrink-0 flex-col overflow-hidden lg:flex">
        <div className="min-h-0 flex-1 overflow-y-auto">
          <AiSuggestionPanel
            suggestion={latestSuggestion}
            context={lastSuggestionContext}
            isLoading={suggestMutation.isPending || suggestions.isFetching}
            onInsert={(text) => setComposerText((prev) => (prev ? `${prev}\n${text}` : text))}
            onSuggest={async (mode) => {
              setAiError(null);
              try {
                const response = await suggestMutation.mutateAsync(mode);
                setLastSuggestionContext(response.context);
              } catch (error) {
                const message = error instanceof Error ? error.message : "Failed to generate suggestion";
                setAiError(message);
              }
            }}
            onAccept={async (suggestionId) => {
              await acceptMutation.mutateAsync(suggestionId);
            }}
            onReject={async (suggestionId) => {
              await rejectMutation.mutateAsync(suggestionId);
            }}
          />

          {aiError?.includes("ai_limit_reached") ? (
            <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              AI limit reached for current plan. <Link href="/settings/billing" className="underline">Upgrade plan</Link>.
            </div>
          ) : aiError ? (
            <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {aiError}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
