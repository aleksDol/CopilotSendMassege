"use client";

import { useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Select } from "@/components/ui/select";
import { useCrmLeads } from "@/lib/hooks/use-app-data";
import { conversationsApi } from "@/lib/api/conversations";
import { useAuth } from "@/lib/auth/context";
import { ApiError } from "@/lib/api/errors";
import type { CrmLeadListItem } from "@/lib/api/types";

const STAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "Все", value: "all" },
  { label: "New", value: "NEW" },
  { label: "Contacted", value: "CONTACTED" },
  { label: "Replied", value: "REPLIED" },
  { label: "Ignored", value: "IGNORED" },
  { label: "Qualified", value: "QUALIFIED" },
  { label: "Proposal", value: "PROPOSAL" },
  { label: "Negotiation", value: "NEGOTIATION" },
  { label: "Won", value: "WON" },
  { label: "Lost", value: "LOST" }
];

const formatDateTime = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString();
};

export default function BasePage() {
  const { token } = useAuth();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<{ stage: string; search: string }>({
    stage: "all",
    search: ""
  });

  const [extraItems, setExtraItems] = useState<CrmLeadListItem[]>([]);
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const leads = useCrmLeads({
    limit: 50,
    stage: filters.stage === "all" ? undefined : filters.stage,
    search: filters.search.trim() ? filters.search.trim() : undefined
  });

  const firstPageItems = leads.data?.items ?? [];
  const firstPageNextCursor = leads.data?.nextCursor ?? null;

  const items = [...firstPageItems, ...extraItems];
  const hasMore = extraItems.length === 0 ? !!firstPageNextCursor : !!nextPageCursor;
  const cursorToLoad = extraItems.length === 0 ? firstPageNextCursor : nextPageCursor;

  const handleFilterChange = useCallback((newFilters: Partial<{ stage: string; search: string }>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
    setExtraItems([]);
    setNextPageCursor(null);
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (!cursorToLoad) return;
    setIsLoadingMore(true);
    try {
      const { crmApi } = await import("@/lib/api/crm");
      const res = await crmApi.listLeads(token ?? "", {
        limit: 50,
        cursor: cursorToLoad,
        stage: filters.stage === "all" ? undefined : filters.stage,
        search: filters.search.trim() ? filters.search.trim() : undefined
      });
      setExtraItems((prev) => [...prev, ...(res.items ?? [])]);
      setNextPageCursor(res.nextCursor ?? null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursorToLoad, token, filters]);

  const stageOptionsNoAll = useMemo(() => STAGE_OPTIONS.filter((o) => o.value !== "all"), []);

  const updateLeadStageMutation = useMutation({
    mutationFn: async (params: { conversationId: string; stage: string }) => {
      return conversationsApi.updateLeadStage(token ?? "", params.conversationId, params.stage);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["crm-leads"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["conversations"], exact: false });
    }
  });

  if (leads.isLoading) {
    return <LoadingState label="Загружаем лидов..." />;
  }

  if (leads.error) {
    const msg = leads.error instanceof ApiError ? leads.error.message : leads.error instanceof Error ? leads.error.message : "Ошибка загрузки";
    return <EmptyState title="Не удалось загрузить" description={msg} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>База</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[240px]">
            <Select
              aria-label="Фильтр по этапу"
              options={STAGE_OPTIONS}
              value={filters.stage}
              onChange={(e) => handleFilterChange({ stage: e.target.value })}
            />
          </div>
          <input
            value={filters.search}
            onChange={(e) => handleFilterChange({ search: e.target.value })}
            placeholder="Поиск по имени / externalConversationId"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          />
          <div className="text-sm text-muted-foreground sm:ml-auto">
            {items.length} шт.{hasMore ? "+" : ""}
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <EmptyState
          title="Пока в базе нет лидов"
          description="Они появятся после входящих сообщений или после отправки первого сообщения из LeadRadar."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Лиды</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Клиент</th>
                  <th className="py-2 pr-3">Источник</th>
                  <th className="py-2 pr-3 w-[220px]">Этап</th>
                  <th className="py-2 pr-3">Статус</th>
                  <th className="py-2 pr-3">Активность</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {items.map((lead) => (
                  <tr key={lead.leadId} className="border-b border-border/60 align-top hover:bg-muted/40">
                    <td className="py-3 pr-3">
                      <div className="font-medium text-foreground">{lead.clientName}</div>
                      {lead.externalConversationId ? (
                        <div className="text-xs text-muted-foreground">{lead.externalConversationId}</div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">
                      <div className="font-medium">{lead.source}</div>
                      <div className="text-xs text-muted-foreground">{lead.conversationType ?? "—"}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <Select
                        aria-label="Этап лида"
                        options={stageOptionsNoAll}
                        value={lead.stage}
                        disabled={updateLeadStageMutation.isPending}
                        onChange={(e) =>
                          void updateLeadStageMutation.mutateAsync({ conversationId: lead.conversationId, stage: e.target.value })
                        }
                        className="h-9"
                      />
                    </td>
                    <td className="py-3 pr-3">{lead.status}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{formatDateTime(lead.lastMessageAt ?? lead.updatedAt)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{formatDateTime(lead.createdAt)}</td>
                    <td className="py-3 pr-3">
                      <Link
                        href={`/chats?conversationId=${encodeURIComponent(lead.conversationId)}`}
                        className="rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted"
                      >
                        Открыть чат
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
          {hasMore && (
            <div className="flex justify-center pb-4">
              <button
                onClick={() => void handleLoadMore()}
                disabled={isLoadingMore}
                className="rounded-md border border-border bg-background px-5 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                {isLoadingMore ? "Загружаем..." : "Загрузить ещё"}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

