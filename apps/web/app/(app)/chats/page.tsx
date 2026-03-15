"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { ConversationList } from "@/components/chats/conversation-list";
import { MessageThread } from "@/components/chats/message-thread";
import { MessageComposer } from "@/components/chats/message-composer";
import { AiSuggestionPanel } from "@/components/chats/ai-suggestion-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const conversations = useConversations({
    waitingForReply: filters.waitingForReply === "all" ? undefined : filters.waitingForReply === "true",
    leadStage: filters.leadStage === "all" ? undefined : filters.leadStage,
    limit: 50
  });

  const selectedId = selectedConversationId ?? conversations.data?.items[0]?.conversationId ?? null;

  useEffect(() => {
    if (!selectedConversationId && conversations.data?.items.length) {
      setSelectedConversationId(conversations.data.items[0].conversationId);
    }
  }, [selectedConversationId, conversations.data]);

  const messages = useConversationMessages(selectedId ?? undefined);
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

  if (conversations.isLoading) {
    return <LoadingState label="Загрузка диалогов..." />;
  }

  if (!conversations.data || conversations.data.items.length === 0) {
    return <EmptyState title="Пока нет диалогов" description="Подключите Telegram и синхронизируйте диалоги в онбординге." />;
  }

  return (
    <div className="grid min-h-[calc(100vh-9rem)] grid-cols-1 gap-4 xl:grid-cols-[320px_1fr_360px]">
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Диалоги</CardTitle>
        </CardHeader>
        <CardContent className="h-[calc(100%-5rem)]">
          <ConversationList
            items={conversations.data.items}
            selectedId={selectedId}
            onSelect={setSelectedConversationId}
            filters={filters}
            onFiltersChange={setFilters}
          />
        </CardContent>
      </Card>

      <div className="flex h-full flex-col gap-3">
        <MessageThread items={messages.data?.items ?? []} />
        <MessageComposer
          value={composerText}
          onChange={setComposerText}
          isSending={sendMessage.isPending}
          onSend={async (text) => {
            await sendMessage.mutateAsync(text);
            setComposerText("");
          }}
        />
      </div>

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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 xl:col-start-3">
          Лимит AI по текущему тарифу исчерпан. <Link href="/settings/billing" className="underline">Улучшить тариф</Link>.
        </div>
      ) : aiError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive xl:col-start-3">
          {aiError}
        </div>
      ) : null}
    </div>
  );
}
