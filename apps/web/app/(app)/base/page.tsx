"use client";

import { useMemo, useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Select } from "@/components/ui/select";
import { useCrmLeads, useTelegramAccounts } from "@/lib/hooks/use-app-data";
import { conversationsApi } from "@/lib/api/conversations";
import { useAuth } from "@/lib/auth/context";
import { ApiError } from "@/lib/api/errors";
import type { CrmLeadListItem } from "@/lib/api/types";

const STAGE_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "All", value: "all" },
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

const stageChipClassName = (stage: string): string => {
  const normalized = stage.trim().toUpperCase();
  if (normalized === "NEW") return "border-transparent bg-red-100 text-red-800";
  if (normalized === "CONTACTED") return "border-transparent bg-amber-100 text-amber-800";
  if (normalized === "REPLIED") return "border-transparent bg-blue-100 text-blue-800";
  if (normalized === "QUALIFIED") return "border-transparent bg-emerald-200 text-emerald-950";
  if (normalized === "WON") return "border-transparent bg-emerald-100 text-emerald-800";
  if (normalized === "LOST") return "border-transparent bg-red-100 text-red-800";
  if (normalized === "IGNORED") return "bg-transparent text-foreground";
  if (normalized === "PROPOSAL") return "border-transparent bg-sky-100 text-sky-800";
  if (normalized === "NEGOTIATION") return "border-transparent bg-cyan-100 text-cyan-800";
  return "border-transparent bg-secondary text-secondary-foreground";
};

const formatDateTime = (iso: string | null) => {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString();
};

export default function BasePage() {
  const { token, company, user } = useAuth();
  const queryClient = useQueryClient();
  const telegramAccounts = useTelegramAccounts();

  const [filters, setFilters] = useState<{ stage: string; search: string; crmAccountFilter: "all" | string }>({
    stage: "all",
    search: "",
    crmAccountFilter: "all"
  });

  const [extraItems, setExtraItems] = useState<CrmLeadListItem[]>([]);
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const leads = useCrmLeads({
    limit: 50,
    stage: filters.stage === "all" ? undefined : filters.stage,
    search: filters.search.trim() ? filters.search.trim() : undefined,
    crmAccountFilter: filters.crmAccountFilter
  });

  const firstPageItems = leads.data?.items ?? [];
  const firstPageNextCursor = leads.data?.nextCursor ?? null;

  const items = [...firstPageItems, ...extraItems];
  const hasMore = extraItems.length === 0 ? !!firstPageNextCursor : !!nextPageCursor;
  const cursorToLoad = extraItems.length === 0 ? firstPageNextCursor : nextPageCursor;

  const datasetScopeKey = `${company?.id ?? ""}:${user?.id ?? ""}:${filters.crmAccountFilter}:${filters.stage}:${filters.search.trim()}`;
  useEffect(() => {
    setExtraItems([]);
    setNextPageCursor(null);
  }, [datasetScopeKey]);

  const handleFilterChange = useCallback(
    (newFilters: Partial<{ stage: string; search: string; crmAccountFilter: "all" | string }>) => {
      setFilters((prev) => ({ ...prev, ...newFilters }));
    },
    []
  );

  const handleLoadMore = useCallback(async () => {
    if (!cursorToLoad) return;
    setIsLoadingMore(true);
    try {
      const { crmApi } = await import("@/lib/api/crm");
      const res = await crmApi.listLeads(token ?? "", {
        limit: 50,
        cursor: cursorToLoad,
        stage: filters.stage === "all" ? undefined : filters.stage,
        search: filters.search.trim() ? filters.search.trim() : undefined,
        channelAccountId: filters.crmAccountFilter === "all" ? undefined : filters.crmAccountFilter
      });
      setExtraItems((prev) => [...prev, ...(res.items ?? [])]);
      setNextPageCursor(res.nextCursor ?? null);
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursorToLoad, token, filters]);

  const stageOptionsNoAll = useMemo(() => STAGE_OPTIONS.filter((o) => o.value !== "all"), []);
  const accountFilterOptions = useMemo(() => {
    const base = [{ label: "All accounts", value: "all" }];
    const extra =
      telegramAccounts.data?.items
        ?.filter((a): a is { channelAccountId: string; displayName?: string | null } => Boolean(a.channelAccountId))
        .map((a) => ({
          label: a.displayName?.trim() ? a.displayName : `Account ${a.channelAccountId.slice(0, 8)}`,
          value: a.channelAccountId
        })) ?? [];
    return [...base, ...extra];
  }, [telegramAccounts.data?.items]);

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
    return <LoadingState label="Loading leads..." />;
  }

  if (leads.error) {
    const msg =
      leads.error instanceof ApiError
        ? leads.error.message
        : leads.error instanceof Error
          ? leads.error.message
          : "Failed to load";
    return <EmptyState title="Failed to load" description={msg} />;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>CRM Base</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="w-full sm:w-[220px]">
            <Select
              aria-label="Account filter"
              options={accountFilterOptions}
              value={filters.crmAccountFilter}
              onChange={(e) => handleFilterChange({ crmAccountFilter: e.target.value })}
            />
          </div>
          <div className="w-full sm:w-[240px]">
            <Select
              aria-label="Stage filter"
              options={STAGE_OPTIONS}
              value={filters.stage}
              onChange={(e) => handleFilterChange({ stage: e.target.value })}
            />
          </div>
          <input
            value={filters.search}
            onChange={(e) => handleFilterChange({ search: e.target.value })}
            placeholder="Search by name / externalConversationId"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          />
          <div className="text-sm text-muted-foreground sm:ml-auto">
            {items.length} pcs{hasMore ? "+" : ""}
          </div>
        </CardContent>
      </Card>

      {items.length === 0 ? (
        <EmptyState title="No leads yet" description="Leads will appear after inbound/outbound message activity." />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Leads</CardTitle>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[1200px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-3">Client</th>
                  <th className="py-2 pr-3">Source</th>
                  <th className="py-2 pr-3">Account</th>
                  <th className="py-2 pr-3 w-[220px]">Stage</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Activity</th>
                  <th className="py-2 pr-3">Created</th>
                  <th className="py-2 pr-3">Actions</th>
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
                      <div className="text-xs text-muted-foreground">{lead.conversationType ?? "-"}</div>
                    </td>
                    <td className="py-3 pr-3">
                      <div className="text-sm">
                        Source:{" "}
                        {lead.account?.title?.trim()
                          ? lead.account.title
                          : lead.account?.channelAccountId
                            ? lead.account.channelAccountId.slice(0, 8)
                            : "unknown"}
                      </div>
                      {lead.account ? (
                        <div className="mt-1 flex flex-wrap gap-1 text-xs">
                          {!lead.account.sendingEnabled ? (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Sending off</span>
                          ) : null}
                          {!lead.account.parsingEnabled ? (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-slate-800">Parsing off</span>
                          ) : null}
                          {String(lead.account.status).toUpperCase() !== "ACTIVE" ? (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-red-800">{lead.account.status}</span>
                          ) : null}
                        </div>
                      ) : null}
                    </td>
                    <td className="py-3 pr-3">
                      <Select
                        aria-label="Lead stage"
                        options={stageOptionsNoAll}
                        value={lead.stage}
                        disabled={updateLeadStageMutation.isPending}
                        onChange={(e) =>
                          void updateLeadStageMutation.mutateAsync({ conversationId: lead.conversationId, stage: e.target.value })
                        }
                        className={[
                          "h-9 min-w-[10rem] max-w-[14rem] cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          stageChipClassName(lead.stage)
                        ].join(" ")}
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
                        Open chat
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
                {isLoadingMore ? "Loading..." : "Load more"}
              </button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}




