"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useLeadRadarActions, useLeadRadarLeads } from "@/lib/hooks/use-app-data";
import type { LeadRadarLeadItem, LeadRadarLeadStatus } from "@/lib/api/types";
import { LeadDrawer } from "@/components/leadradar/lead-drawer";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import Link from "next/link";

const STATUSES: Array<{ label: string; value: LeadRadarLeadStatus | "all" }> = [
  { label: "Все статусы", value: "all" },
  { label: "New", value: "new" },
  { label: "Reviewed", value: "reviewed" },
  { label: "Hot", value: "hot" },
  { label: "Contacted", value: "contacted" },
  { label: "Replied", value: "replied" },
  { label: "Qualified", value: "qualified" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
  { label: "Ignored", value: "ignored" },
  { label: "Spam", value: "spam" }
];

const ROW_STATUS_OPTIONS: Array<{ label: string; value: LeadRadarLeadStatus }> = STATUSES.filter(
  (s): s is { label: string; value: LeadRadarLeadStatus } => s.value !== "all"
);

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function truncate(text: string | null, max = 120): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function isChannelCommentLead(lead: LeadRadarLeadItem): boolean {
  return lead.sourceType === "channel_comments";
}

function displayName(lead: LeadRadarLeadItem) {
  if (lead.displayName?.trim()) return lead.displayName.trim();
  if (lead.username?.trim()) return `@${lead.username.trim()}`;
  return "—";
}

function secondaryId(lead: LeadRadarLeadItem): string | null {
  if (lead.username?.trim()) return `@${lead.username.trim()}`;
  if (lead.telegramUserId?.trim()) return `ID: ${lead.telegramUserId.trim()}`;
  return null;
}

export default function LeadRadarInboxPage() {
  const [filters, setFilters] = useState<{
    status: LeadRadarLeadStatus | "all";
    search: string;
  }>({ status: "all", search: "" });
  const [page, setPage] = useState(1);
  const limit = 20;
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);

  const leads = useLeadRadarLeads({
    status: filters.status,
    search: filters.search,
    page,
    limit,
    sortBy: "created_at",
    sortOrder: "desc"
  });
  const actions = useLeadRadarActions();

  const totalPages = useMemo(() => {
    const total = leads.data?.total ?? 0;
    return Math.max(1, Math.ceil(total / limit));
  }, [leads.data?.total]);

  if (leads.isLoading) {
    return <LoadingState label="Загрузка лидов..." />;
  }

  if (leads.error) {
    return <EmptyState title="Ошибка" description={leads.error instanceof Error ? leads.error.message : "Не удалось загрузить лиды"} />;
  }

  const data = leads.data;
  if (!data || data.items.length === 0) {
    const isFiltered = filters.status !== "all" || Boolean(filters.search.trim());
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">LeadRadar</h1>
          <p className="text-sm text-muted-foreground">Inbox лидов (первые результаты работы LeadRadar).</p>
          <div className="pt-2">
            <LeadRadarNav />
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Фильтры</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            <Select
              value={filters.status}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, status: event.target.value as LeadRadarLeadStatus | "all" }));
                setPage(1);
              }}
              options={STATUSES.map((s) => ({ label: s.label, value: s.value }))}
            />
            <input
              value={filters.search}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, search: e.target.value }));
                setPage(1);
              }}
              placeholder="Поиск по сообщению / имени / username"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            />
          </CardContent>
        </Card>
        {isFiltered ? (
          <div className="space-y-3">
            <EmptyState title="Нет результатов" description="По текущим фильтрам лидов не найдено." />
            <Button
              variant="outline"
              onClick={() => {
                setFilters({ status: "all", search: "" });
                setPage(1);
              }}
            >
              Сбросить фильтры
            </Button>
          </div>
        ) : (
          <EmptyState
            title="Лидов пока нет"
            description={
              "Добавьте Sources (чаты) и Keywords (фразы), включите LeadRadar в Settings — после этого лиды будут появляться автоматически."
            }
          />
        )}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/leadradar/sources"
            className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition hover:opacity-90"
          >
            Sources
          </Link>
          <Link
            href="/leadradar/keywords"
            className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition hover:opacity-90"
          >
            Keywords
          </Link>
          <Link
            href="/leadradar/settings"
            className="rounded-md bg-secondary px-3 py-2 text-sm font-medium text-secondary-foreground transition hover:opacity-90"
          >
            Settings
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">LeadRadar</h1>
          <p className="text-sm text-muted-foreground">Inbox лидов (таблица).</p>
          <div className="pt-2">
            <LeadRadarNav />
          </div>
        </div>
        <div className="text-sm text-muted-foreground">Всего: {data.total}</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <Select
            value={filters.status}
            onChange={(event) => {
              setFilters((prev) => ({ ...prev, status: event.target.value as LeadRadarLeadStatus | "all" }));
              setPage(1);
            }}
            options={STATUSES.map((s) => ({ label: s.label, value: s.value }))}
          />
          <input
            value={filters.search}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, search: e.target.value }));
              setPage(1);
            }}
            placeholder="Поиск по сообщению / имени / username"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Inbox</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th className="py-2 pr-3">Клиент</th>
                <th className="py-2 pr-3">Чат</th>
                <th className="py-2 pr-3">Сообщение</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3 w-[200px]">Статус</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((lead) => (
                <tr
                  key={lead.id}
                  className="border-b border-border/60 align-top hover:bg-muted/40"
                  onClick={() => {
                    setSelectedLeadId(lead.id);
                  }}
                >
                  <td className="py-3 pr-3">
                    <div className="font-medium text-foreground">{displayName(lead)}</div>
                    {secondaryId(lead) ? <div className="text-xs text-muted-foreground">{secondaryId(lead)}</div> : null}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="font-medium">{lead.chatTitle ?? lead.chatId}</div>
                    <div className="text-xs text-muted-foreground">{lead.chatId}</div>
                  </td>
                  <td className="py-3 pr-3">
                    <div className="max-w-[420px] whitespace-pre-wrap text-foreground/90">{truncate(lead.messageText, 160) || "—"}</div>
                    {isChannelCommentLead(lead) ? (
                      <div className="pt-1 text-xs text-muted-foreground">
                        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5">Комментарий канала</span>
                        {lead.relatedPostId?.trim() ? <span className="pl-2">post: {lead.relatedPostId}</span> : null}
                      </div>
                    ) : null}
                    {lead.contextPreview?.trim() ? (
                      <div className="pt-1 max-w-[420px] text-xs text-muted-foreground whitespace-pre-wrap">
                        {truncate(lead.contextPreview, 160)}
                      </div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">{lead.score}</td>
                  <td className="py-3 pr-3 text-muted-foreground">{formatDate(lead.createdAt)}</td>
                  <td className="py-3 pr-3" onClick={(e) => e.stopPropagation()}>
                    <Select
                      className="h-9 min-w-[11rem] max-w-[14rem] text-xs"
                      value={lead.status}
                      disabled={actions.updateLeadStatus.isPending}
                      options={ROW_STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                      onChange={async (e) => {
                        const next = e.target.value as LeadRadarLeadStatus;
                        if (next === lead.status) return;
                        await actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: next });
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
              disabled={page <= 1 || leads.isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Назад
            </button>
            <div className="text-sm text-muted-foreground">
              Стр. {page} / {totalPages}
            </div>
            <button
              className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
              disabled={page >= totalPages || leads.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Вперёд
            </button>
          </div>
        </CardContent>
      </Card>

      <LeadDrawer
        leadId={selectedLeadId}
        onClose={() => {
          setSelectedLeadId(null);
        }}
      />
    </div>
  );
}

