"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
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

  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(initialConversation);
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

  const selectedId = selectedConversationId ?? conversations.data?.items[0]?.conversationId ?? null;

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
      const message = err instanceof Error ? err.message : "Не удалось отправить сообщение";
      setSendError(message);
    }
  };

  if (conversations.isLoading) {
    return <LoadingState label="Загрузка диалогов..." />;
  }

  if (!conversations.data || conversations.data.items.length === 0) {
    return <EmptyState title="Пока нет диалогов" description="Подключите Telegram и синхронизируйте диалоги в онбординге." />;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden md:flex-row">
      {/* Left: chat list — как в мессенджере, на всю высоту */}
      <aside className="flex min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-card md:w-[280px] xl:w-[320px]">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Диалоги</h2>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <ConversationList
            items={conversations.data.items}
            selectedId={selectedId}
            onSelect={setSelectedConversationId}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </div>
      </aside>

      {/* Center: сообщения выбранного чата — на всю высоту */}
      <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-card">
          <MessageThread items={messages.data?.items ?? []} />
        </div>
        <div className="shrink-0">
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
        </div>
      </section>

      {/* Right: ИИ-агент / копилот — на всю высоту */}
      <aside className="hidden min-h-0 w-[360px] shrink-0 flex-col overflow-hidden xl:flex">
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
              const message = error instanceof Error ? error.message : "Не удалось сгенерировать подсказку";
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
            Лимит AI по текущему тарифу исчерпан. <Link href="/settings/billing" className="underline">Улучшить тариф</Link>.
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
