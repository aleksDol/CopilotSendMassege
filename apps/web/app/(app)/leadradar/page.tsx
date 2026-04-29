"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { TrialPaywallCard } from "@/components/billing/trial-paywall-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useLeadRadarActions, useLeadRadarLeads, useSelectedLeadRadarParsingChannelAccountId } from "@/lib/hooks/use-app-data";
import type { LeadRadarLeadItem, LeadRadarLeadStatus, TelegramAccountResponse } from "@/lib/api/types";
import { LeadDrawer } from "@/components/leadradar/lead-drawer";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import Link from "next/link";
import { useAuth } from "@/lib/auth/context";
import { ApiError } from "@/lib/api/errors";
import type { UseMutationResult } from "@tanstack/react-query";

function isManualLead(lead: LeadRadarLeadItem): boolean {
  return lead.sourceType === "manual";
}

function ManualLeadAddModal({
  open,
  onClose,
  mutation
}: {
  open: boolean;
  onClose: () => void;
  mutation: UseMutationResult<
    LeadRadarLeadItem,
    Error,
    { name?: string | null; username: string; comment: string },
    unknown
  >;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [comment, setComment] = useState("");
  const [fieldError, setFieldError] = useState<{ username?: string; comment?: string }>({});
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFieldError({});
    setRequestError(null);
  }, [open]);

  if (!open) return null;

  const submit = async () => {
    setFieldError({});
    setRequestError(null);
    const u = username.trim();
    const c = comment.trim();
    const next: { username?: string; comment?: string } = {};
    if (!u) next.username = "Enter username";
    if (!c) next.comment = "Enter comment";
    if (Object.keys(next).length) {
      setFieldError(next);
      return;
    }
    try {
      await mutation.mutateAsync({
        name: name.trim() ? name.trim() : null,
        username: u,
        comment: c
      });
      setName("");
      setUsername("");
      setComment("");
      onClose();
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : err instanceof Error ? err.message : "Could not create lead";
      setRequestError(msg);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="manual-lead-title"
      onClick={(e) => {
        if (e.target === e.currentTarget && !mutation.isPending) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-lg border border-border bg-background p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="manual-lead-title" className="text-lg font-semibold">
            Add manual lead
          </h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
            onClick={onClose}
            disabled={mutation.isPending}
          >
            Close
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Lead from contacts outside automatic Telegram monitoring.
        </p>

        <div className="mt-4 grid gap-3">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Name (optional)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="How to address you"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              disabled={mutation.isPending}
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Username *</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="@username or username"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
              disabled={mutation.isPending}
            />
            {fieldError.username ? <span className="text-xs text-destructive">{fieldError.username}</span> : null}
          </label>
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Comment *</span>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Lead origin, context, deal notes"
              rows={4}
              className="rounded-md border border-border bg-background px-3 py-2 text-sm"
              disabled={mutation.isPending}
            />
            {fieldError.comment ? <span className="text-xs text-destructive">{fieldError.comment}</span> : null}
          </label>
          {requestError ? <div className="text-sm text-destructive">{requestError}</div> : null}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void submit()} disabled={mutation.isPending}>
            {mutation.isPending ? "Adding\u2026" : "Add"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// LeadRadar is prospecting inbox: default view shows only NEW.
const FILTER_STATUSES: Array<{ label: string; value: LeadRadarLeadStatus | "all" }> = [
  { label: "NEW", value: "new" },
  { label: "CONTACTED", value: "contacted" },
  { label: "SPAM", value: "spam" },
  { label: "ALL", value: "all" }
];

const ROW_STATUS_OPTIONS: Array<{ label: string; value: LeadRadarLeadStatus }> = [
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

const statusChipClassName = (status: LeadRadarLeadStatus): string => {
  // Requested palette:
  // new -> red, contacted -> yellow, replied -> blue, qualified -> dark green, spam -> black, won -> light green
  if (status === "new") return "border-transparent bg-red-100 text-red-800";
  if (status === "contacted") return "border-transparent bg-amber-100 text-amber-800";
  if (status === "replied") return "border-transparent bg-blue-100 text-blue-800";
  if (status === "qualified") return "border-transparent bg-emerald-200 text-emerald-950";
  if (status === "spam") return "border-transparent bg-black text-white";
  if (status === "won") return "border-transparent bg-emerald-100 text-emerald-800";

  // Defaults for other statuses.
  if (status === "hot") return "border-transparent bg-amber-100 text-amber-800";
  if (status === "lost") return "border-transparent bg-red-100 text-red-800";
  if (status === "ignored") return "bg-transparent text-foreground";
  return "border-transparent bg-secondary text-secondary-foreground";
};

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
  return t.length > max ? `${t.slice(0, max)}\u2026` : t;
}

function isChannelCommentLead(lead: LeadRadarLeadItem): boolean {
  return lead.sourceType === "channel_comments";
}

function isAuthorProfileLead(lead: LeadRadarLeadItem): boolean {
  return lead.sourceType === "author_profile";
}

function displayName(lead: LeadRadarLeadItem) {
  if (lead.displayName?.trim()) return lead.displayName.trim();
  if (lead.username?.trim()) return `@${lead.username.trim()}`;
  return "\u2014";
}

function secondaryId(lead: LeadRadarLeadItem): string | null {
  if (lead.username?.trim()) return `@${lead.username.trim()}`;
  if (lead.telegramUserId?.trim()) return `ID: ${lead.telegramUserId.trim()}`;
  return null;
}

export default function LeadRadarInboxPage() {
  const { access } = useAuth();
  const [filters, setFilters] = useState<{
    status: LeadRadarLeadStatus | "all";
    search: string;
  }>({ status: "new", search: "" });
  const [page, setPage] = useState(1);
  const limit = 20;
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const {
    selectedLeadRadarParsingChannelAccountId,
    setSelectedLeadRadarParsingChannelAccountId,
    parsingAccounts
  } = useSelectedLeadRadarParsingChannelAccountId();

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

  const parsingAccountOptions = parsingAccounts
    .filter((account: TelegramAccountResponse) => Boolean(account.channelAccountId))
    .map((account: TelegramAccountResponse) => ({
      value: String(account.channelAccountId),
      label: account.displayName?.trim() ? account.displayName : `Account ${String(account.channelAccountId).slice(0, 8)}`
    }));

  if (access?.subscriptionStatus === "expired") {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-semibold">LeadRadar</h1>
          <p className="text-sm text-muted-foreground">Inbox leads.</p>
          <div className="pt-2">
            <LeadRadarNav />
          </div>
        </div>
        <TrialPaywallCard />
      </div>
    );
  }

  if (leads.isLoading) {
    return <LoadingState label="Loading leads\u2026" />;
  }

  if (leads.error) {
    return (
      <EmptyState
        title="Error"
        description={leads.error instanceof Error ? leads.error.message : "Could not load leads"}
      />
    );
  }

  if (!parsingAccountOptions.length) {
    return (
      <EmptyState
        title="LeadRadar"
        description="No Telegram account has parsing enabled. Enable it in Telegram settings."
      />
    );
  }

  const data = leads.data;
  if (!data || data.items.length === 0) {
    const isFiltered = filters.status !== "all" || Boolean(filters.search.trim());
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">LeadRadar</h1>
            <p className="text-sm text-muted-foreground">
              Inbox leads (early LeadRadar results).
            </p>
            <div className="pt-2">
              <LeadRadarNav />
            </div>
          </div>
          <div className="min-w-[260px]">
            <div className="mb-1 text-xs text-muted-foreground">Parsing account</div>
            <Select
              value={selectedLeadRadarParsingChannelAccountId}
              onChange={(event) => {
                setSelectedLeadRadarParsingChannelAccountId(event.target.value);
                setPage(1);
              }}
              options={parsingAccountOptions}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setManualModalOpen(true)}>
            Add manual lead
          </Button>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 md:grid-cols-2">
            <Select
              value={filters.status}
              onChange={(event) => {
                setFilters((prev) => ({ ...prev, status: event.target.value as LeadRadarLeadStatus | "all" }));
                setPage(1);
              }}
              options={FILTER_STATUSES.map((s) => ({ label: s.label, value: s.value }))}
            />
            <input
              value={filters.search}
              onChange={(e) => {
                setFilters((prev) => ({ ...prev, search: e.target.value }));
                setPage(1);
              }}
              placeholder="Search message / name / username"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm"
            />
          </CardContent>
        </Card>
        {isFiltered ? (
          <div className="space-y-3">
            <EmptyState title="No results" description="No leads match the current filters." />
            <Button
              variant="outline"
              onClick={() => {
                  setFilters({ status: "new", search: "" });
                setPage(1);
              }}
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <EmptyState
            title="No leads yet"
            description={
              "Add Sources (chats). Add Keywords (phrases). Enable LeadRadar in Settings — leads will sync automatically."
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
        <ManualLeadAddModal
          open={manualModalOpen}
          onClose={() => setManualModalOpen(false)}
          mutation={actions.createManualLead}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">LeadRadar</h1>
          <p className="text-sm text-muted-foreground">Inbox leads (table).</p>
          <div className="pt-2">
            <LeadRadarNav />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-[260px]">
            <div className="mb-1 text-xs text-muted-foreground">Parsing account</div>
            <Select
              value={selectedLeadRadarParsingChannelAccountId}
              onChange={(event) => {
                setSelectedLeadRadarParsingChannelAccountId(event.target.value);
                setPage(1);
              }}
              options={parsingAccountOptions}
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setManualModalOpen(true)}>
            Add manual lead
          </Button>
          <div className="text-sm text-muted-foreground">Total: {data.total}</div>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2">
          <Select
            value={filters.status}
            onChange={(event) => {
              setFilters((prev) => ({ ...prev, status: event.target.value as LeadRadarLeadStatus | "all" }));
              setPage(1);
            }}
            options={FILTER_STATUSES.map((s) => ({ label: s.label, value: s.value }))}
          />
          <input
            value={filters.search}
            onChange={(e) => {
              setFilters((prev) => ({ ...prev, search: e.target.value }));
              setPage(1);
            }}
            placeholder="Search message / name / username"
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
                <th className="py-2 pr-3">Client</th>
                <th className="py-2 pr-3">Chat</th>
                <th className="py-2 pr-3">Message</th>
                <th className="py-2 pr-3">Score</th>
                <th className="py-2 pr-3">Created</th>
                <th className="py-2 pr-3 w-[240px]">Status</th>
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
                    {!isManualLead(lead) ? (
                      <div className="text-xs text-muted-foreground">{lead.chatId}</div>
                    ) : null}
                  </td>
                  <td className="py-3 pr-3">
                    <div className="max-w-[420px] whitespace-pre-wrap text-foreground/90">{truncate(lead.messageText, 160) || "—"}</div>
                    {isAuthorProfileLead(lead) ? (
                      <div className="pt-1 text-xs text-muted-foreground">
                        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5">Profile</span>
                      </div>
                    ) : null}
                    {isChannelCommentLead(lead) ? (
                      <div className="pt-1 text-xs text-muted-foreground">
                        <span className="rounded border border-border bg-muted/30 px-1.5 py-0.5">Channel comment</span>
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
                    <div className="flex items-center gap-2">
                      <Select
                        className={[
                          "h-8 min-w-[10rem] max-w-[14rem] cursor-pointer rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                          statusChipClassName(lead.status)
                        ].join(" ")}
                        value={lead.status}
                        disabled={actions.updateLeadStatus.isPending}
                        options={ROW_STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                        onChange={async (e) => {
                          const next = e.target.value as LeadRadarLeadStatus;
                          if (next === lead.status) return;
                          await actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: next });
                        }}
                      />

                      {lead.status !== "spam" ? (
                        <button
                          type="button"
                          className="rounded-md border border-border bg-background px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          disabled={actions.updateLeadStatus.isPending}
                          onClick={async () => {
                            await actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: "spam" });
                          }}
                        >
                          Mark as Spam
                        </button>
                      ) : null}
                    </div>
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
              Back
            </button>
            <div className="text-sm text-muted-foreground">
              Page {page} / {totalPages}
            </div>
            <button
              className="rounded-md border border-border bg-background px-3 py-2 text-sm disabled:opacity-50"
              disabled={page >= totalPages || leads.isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
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
      <ManualLeadAddModal
        open={manualModalOpen}
        onClose={() => setManualModalOpen(false)}
        mutation={actions.createManualLead}
      />
    </div>
  );
}




