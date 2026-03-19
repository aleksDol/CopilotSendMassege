"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
  useSuggestReplyMutation,
  useTelegramAccount
} from "@/lib/hooks/use-app-data";
import { useChatsRealtime, type NewMessagePayload } from "@/lib/hooks/use-chats-realtime";
import { aiApi } from "@/lib/api/ai";
import { useAuth } from "@/lib/auth/context";

const CONVERSATIONS_POLL_INTERVAL_MS = 8_000;
const MESSAGES_POLL_INTERVAL_MS = 3_000;

const UNREAD_STORAGE_VERSION = "v1";
const getUnreadStorageKey = (companyId?: string | null, userId?: string | null, channelAccountId?: string | null) =>
  companyId && userId && channelAccountId
    ? `chats-unread:${UNREAD_STORAGE_VERSION}:${companyId}:${userId}:${channelAccountId}`
    : null;

const SELECTED_STORAGE_VERSION = "v1";
const getSelectedStorageKey = (companyId?: string | null, userId?: string | null, channelAccountId?: string | null) =>
  companyId && userId && channelAccountId
    ? `chats-selected:${SELECTED_STORAGE_VERSION}:${companyId}:${userId}:${channelAccountId}`
    : null;

const readSelectedFromStorage = (key: string | null): string | null => {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    const v = (raw ?? "").trim();
    return v.length ? v : null;
  } catch {
    return null;
  }
};

/** Get conversationId from URL. Prefer params; on client fallback to window.location so we don't rely on useSearchParams being populated on first render (it can be empty during hydration). */
const getConversationIdFromUrl = (params: URLSearchParams | null): string | null => {
  const fromParams = params?.get("conversationId");
  if (fromParams?.trim()) return fromParams.trim();
  if (typeof window === "undefined") return null;
  const urlParams = new URLSearchParams(window.location.search);
  const fromWindow = urlParams.get("conversationId");
  return fromWindow?.trim() ?? null;
};

const readUnreadFromStorage = (
  key: string | null
): Record<string, { lastMessagePreview?: string | null; conversationTitle?: string | null; sentAt?: string | null }> => {
  if (!key || typeof window === "undefined") {
    return {};
  }

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, { lastMessagePreview?: string | null; conversationTitle?: string | null; sentAt?: string | null }>;
  } catch {
    return {};
  }
};

export default function ChatsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initialWaiting = params.get("waitingForReply") ?? "all";
  const initialConversation = params.get("conversationId");

  const { token, company, user } = useAuth();
  const queryClient = useQueryClient();
  const telegramAccount = useTelegramAccount();
  const telegramStatus = telegramAccount.data?.loginStatus ?? telegramAccount.data?.status ?? "login_required";
  const isTelegramConnected = telegramStatus === "connected";
  const channelAccountId = telegramAccount.data?.channelAccountId ?? null;
  const unreadStorageKey = getUnreadStorageKey(company?.id, user?.id, channelAccountId);
  const selectedStorageKey = getSelectedStorageKey(company?.id, user?.id, channelAccountId);

  const [filters, setFilters] = useState({
    search: "",
    waitingForReply: initialWaiting === "true" || initialWaiting === "false" ? initialWaiting : "all",
    leadStage: "all"
  });

  const [selectedConversationId, setSelectedConversationIdState] = useState<string | null>(initialConversation);
  const [unreadByConversationId, setUnreadByConversationId] = useState<
    Record<string, { lastMessagePreview?: string | null; conversationTitle?: string | null; sentAt?: string | null }>
  >(() => readUnreadFromStorage(unreadStorageKey));

  // If Telegram is disconnected for the current session, hide chats immediately and clear persisted chat UI state.
  useEffect(() => {
    if (isTelegramConnected) return;
    setSelectedConversationIdState(null);
    if (typeof window !== "undefined") {
      try {
        if (selectedStorageKey) window.localStorage.removeItem(selectedStorageKey);
        if (unreadStorageKey) window.localStorage.removeItem(unreadStorageKey);
      } catch {
        // ignore storage failures
      }
    }
    setUnreadByConversationId({});
  }, [isTelegramConnected, selectedStorageKey, unreadStorageKey]);

  const setSelectedConversationId = useCallback((id: string | null) => {
    setSelectedConversationIdState(id);

    // Persist last selected as a fallback when URL doesn't specify a chat
    try {
      if (selectedStorageKey && typeof window !== "undefined") {
        if (id) window.localStorage.setItem(selectedStorageKey, id);
        else window.localStorage.removeItem(selectedStorageKey);
      }
    } catch {
      // ignore storage failures
    }

    // URL is the source of truth for restore-on-refresh
    const next = new URLSearchParams(params.toString());
    if (id) next.set("conversationId", id);
    else next.delete("conversationId");
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });

    if (id) {
      setUnreadByConversationId((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  }, [params, pathname, router, selectedStorageKey]);

  const handleNewMessageInOtherChat = useCallback((payload: NewMessagePayload) => {
    setUnreadByConversationId((prev) => ({
      ...prev,
      [payload.conversationId]: {
        lastMessagePreview: payload.lastMessagePreview ?? null,
        conversationTitle: payload.conversationTitle ?? null,
        sentAt: payload.sentAt ?? null
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

  const selectedId = selectedConversationId;

  useChatsRealtime(selectedId, handleNewMessageInOtherChat);

  // Sync selection from URL (back/forward, manual edits, refresh).
  // Use getConversationIdFromUrl so we read the real URL when params are empty on first render (Next.js hydration).
  useEffect(() => {
    const cid = getConversationIdFromUrl(params);
    if (cid !== selectedConversationId) {
      setSelectedConversationIdState(cid);
    }
    // Intentionally depend only on params to avoid loops with router.replace
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  // If URL doesn't specify a chat, restore the last selected for this workspace.
  // Always check the real URL (window.location) so we don't restore over ?conversationId=... when params are empty on first render.
  useEffect(() => {
    if (selectedConversationId) return;
    const urlCid = getConversationIdFromUrl(params);
    if (urlCid) return;
    const restored = readSelectedFromStorage(selectedStorageKey);
    if (restored) {
      setSelectedConversationId(restored);
    }
  }, [params, selectedConversationId, selectedStorageKey, setSelectedConversationId]);

  useEffect(() => {
    setUnreadByConversationId(readUnreadFromStorage(unreadStorageKey));
  }, [unreadStorageKey]);

  useEffect(() => {
    if (!unreadStorageKey || typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(unreadStorageKey, JSON.stringify(unreadByConversationId));
  }, [unreadByConversationId, unreadStorageKey]);

  // Auto-select first conversation only when nothing is selected and URL doesn't specify a chat (avoid overwriting URL on slow hydration).
  useEffect(() => {
    if (selectedConversationId) return;
    if (getConversationIdFromUrl(params)) return;
    if (conversations.data?.items.length) {
      setSelectedConversationId(conversations.data.items[0].conversationId);
    }
  }, [params, selectedConversationId, conversations.data, setSelectedConversationId]);

  const messages = useConversationMessages(selectedId ?? undefined, 50, MESSAGES_POLL_INTERVAL_MS);
  const suggestions = useAiSuggestions(selectedId ?? undefined);

  const sendMessage = useSendMessageMutation(selectedId ?? "");
  const suggestMutation = useSuggestReplyMutation(selectedId ?? "");

  const aiSuggestionsScope = company?.id ?? "";
  const acceptMutation = useMutation({
    mutationFn: (suggestionId: string) => aiApi.accept(token ?? "", suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", aiSuggestionsScope, selectedId] });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => aiApi.reject(token ?? "", suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["ai-suggestions", aiSuggestionsScope, selectedId] });
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

  if (!isTelegramConnected) {
    return (
      <EmptyState
        title="Telegram не подключён"
        description="Подключите Telegram в настройках, чтобы увидеть чаты."
      />
    );
  }

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
            isLoading={suggestMutation.isPending}
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
