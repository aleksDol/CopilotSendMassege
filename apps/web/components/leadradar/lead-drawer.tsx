"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLeadRadarActions, useLeadRadarLead } from "@/lib/hooks/use-app-data";
import type { LeadRadarLeadStatus } from "@/lib/api/types";

const STATUS_OPTIONS: Array<{ label: string; value: LeadRadarLeadStatus }> = [
  { label: "new", value: "new" },
  { label: "reviewed", value: "reviewed" },
  { label: "hot", value: "hot" },
  { label: "contacted", value: "contacted" },
  { label: "replied", value: "replied" },
  { label: "qualified", value: "qualified" },
  { label: "won", value: "won" },
  { label: "lost", value: "lost" },
  { label: "ignored", value: "ignored" },
  { label: "spam", value: "spam" }
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderContextLine(m: { sender: string | null; text: string | null }) {
  const sender = m.sender?.trim() || "unknown";
  const text = (m.text ?? "").trim() || "—";
  return `[${sender}]: ${text}`;
}

function statusBadgeVariant(status: LeadRadarLeadStatus): "secondary" | "warning" | "success" | "outline" {
  if (status === "hot") return "warning";
  if (status === "won") return "success";
  if (status === "lost" || status === "spam") return "outline";
  return "secondary";
}

export function LeadDrawer({
  leadId,
  onClose
}: {
  leadId: string | null;
  onClose: () => void;
}) {
  const leadQuery = useLeadRadarLead(leadId);
  const actions = useLeadRadarActions();

  const lead = leadQuery.data?.lead ?? null;
  const events = leadQuery.data?.events ?? [];
  const context = leadQuery.data?.context ?? null;

  const [notes, setNotes] = useState<string>("");
  const [notesDirty, setNotesDirty] = useState(false);

  useEffect(() => {
    if (!leadId) return;
    setNotes(lead?.notes ?? "");
    setNotesDirty(false);
  }, [leadId, lead?.notes]);

  const status = lead?.status ?? "new";
  const title = useMemo(() => {
    if (!lead) return "Lead";
    const name = lead.displayName?.trim() || (lead.username ? `@${lead.username}` : "—");
    return name;
  }, [lead]);

  if (!leadId) return null;

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-dvh w-full max-w-[520px] flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {lead?.chatTitle ?? lead?.chatId ?? "—"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={!lead || actions.removeLead?.isPending}
            onClick={async () => {
              if (!lead) return;
              const ok = window.confirm("Удалить лида из Inbox LeadRadar? Это удалит запись лида, а также его context/history. Действие необратимо.");
              if (!ok) return;
              await actions.removeLead.mutateAsync(lead.id);
              onClose();
            }}
          >
            Delete
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {leadQuery.isLoading ? <LoadingState label="Загрузка лида..." /> : null}

        {leadQuery.error ? (
          <EmptyState
            title="Ошибка"
            description={leadQuery.error instanceof Error ? leadQuery.error.message : "Не удалось загрузить лид"}
          />
        ) : null}

        {!leadQuery.isLoading && !leadQuery.error && !lead ? (
          <EmptyState title="Лид не найден" description="Возможно, он был удалён или недоступен." />
        ) : null}

        {lead ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Основное</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={statusBadgeVariant(lead.status)}>{lead.status}</Badge>
                  <span className="text-muted-foreground">score:</span> <span className="font-medium">{lead.score}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Message</div>
                  <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">
                    {(lead.messageText ?? "").trim() || "—"}
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-muted-foreground">Username</div>
                    <div className="font-medium">{lead.username ? `@${lead.username}` : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="font-medium">{formatDate(lead.createdAt)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-2">
                <Select
                  value={status}
                  onChange={async (e) => {
                    const next = e.target.value as LeadRadarLeadStatus;
                    await actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: next });
                  }}
                  options={STATUS_OPTIONS.map((o) => ({ label: o.label, value: o.value }))}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actions.updateLeadStatus.isPending}
                  onClick={() => actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: "hot" })}
                >
                  Mark hot
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={actions.updateLeadStatus.isPending}
                  onClick={() => actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: "contacted" })}
                >
                  Contacted
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actions.updateLeadStatus.isPending}
                  onClick={() => actions.updateLeadStatus.mutateAsync({ leadId: lead.id, status: "ignored" })}
                >
                  Ignore
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    setNotesDirty(true);
                  }}
                  placeholder="Заметки по лиду…"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">{notesDirty ? "Есть несохранённые изменения" : " "}</div>
                  <Button
                    size="sm"
                    disabled={!notesDirty || actions.updateLeadNotes.isPending}
                    onClick={async () => {
                      await actions.updateLeadNotes.mutateAsync({ leadId: lead.id, notes: notes.trim() ? notes : null });
                      setNotesDirty(false);
                    }}
                  >
                    Save
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Context</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">Before</div>
                  <div className="space-y-1">
                    {(context?.beforeMessages ?? []).length === 0 ? (
                      <div className="text-muted-foreground">—</div>
                    ) : (
                      (context?.beforeMessages ?? []).map((m, idx) => (
                        <div key={`b-${idx}`} className="rounded-md border border-border bg-muted/20 p-2">
                          <div className="whitespace-pre-wrap">{renderContextLine(m)}</div>
                          <div className="pt-1 text-xs text-muted-foreground">{formatDate(m.date)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-xs text-muted-foreground">After</div>
                  <div className="space-y-1">
                    {(context?.afterMessages ?? []).length === 0 ? (
                      <div className="text-muted-foreground">—</div>
                    ) : (
                      (context?.afterMessages ?? []).map((m, idx) => (
                        <div key={`a-${idx}`} className="rounded-md border border-border bg-muted/20 p-2">
                          <div className="whitespace-pre-wrap">{renderContextLine(m)}</div>
                          <div className="pt-1 text-xs text-muted-foreground">{formatDate(m.date)}</div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>History</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {events.length === 0 ? (
                  <div className="text-muted-foreground">—</div>
                ) : (
                  events.map((e) => (
                    <div key={e.id} className="rounded-md border border-border bg-muted/10 p-2">
                      <div className="font-medium">{e.eventType}</div>
                      {e.newStatus ? <div className="text-muted-foreground">→ {e.newStatus}</div> : null}
                      {e.comment ? <div className="whitespace-pre-wrap pt-1">{e.comment}</div> : null}
                      <div className="pt-1 text-xs text-muted-foreground">{formatDate(e.createdAt)}</div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>
    </aside>
  );
}

