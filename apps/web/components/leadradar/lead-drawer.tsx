"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useLeadRadarActions, useLeadRadarLead, useTelegramAccounts } from "@/lib/hooks/use-app-data";
import type { LeadRadarLeadStatus } from "@/lib/api/types";
import { isLeadRadarSendingSelectionError } from "@/lib/api/errors";
import { cn } from "@/lib/utils/cn";

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
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function renderContextLine(m: { sender: string | null; text: string | null }) {
  const sender = m.sender?.trim() || "unknown";
  const text = (m.text ?? "").trim() || "\u2014";
  return `[${sender}]: ${text}`;
}

function statusBadgeClassName(status: LeadRadarLeadStatus): string {
  // Requested palette:
  // new -> red, contacted -> yellow, replied -> blue, qualified -> dark green, spam -> black, won -> light green
  if (status === "new") return "border-transparent bg-red-100 text-red-800";
  if (status === "contacted") return "border-transparent bg-amber-100 text-amber-800";
  if (status === "replied") return "border-transparent bg-blue-100 text-blue-800";
  if (status === "qualified") return "border-transparent bg-emerald-200 text-emerald-950";
  if (status === "spam") return "border-transparent bg-black text-white";
  if (status === "won") return "border-transparent bg-emerald-100 text-emerald-800";

  // Keep reasonable defaults for other statuses.
  if (status === "hot") return "border-transparent bg-amber-100 text-amber-800";
  if (status === "lost") return "border-transparent bg-red-100 text-red-800";
  if (status === "ignored") return "bg-transparent text-foreground";
  return "border-transparent bg-secondary text-secondary-foreground";
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
  const telegramAccountsQuery = useTelegramAccounts();

  const lead = leadQuery.data?.lead ?? null;
  const events = leadQuery.data?.events ?? [];
  const context = leadQuery.data?.context ?? null;

  const [notes, setNotes] = useState<string>("");
  const [notesDirty, setNotesDirty] = useState(false);

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerText, setComposerText] = useState("");
  const [sendingChannelAccountId, setSendingChannelAccountId] = useState("");
  const [composerError, setComposerError] = useState<string | null>(null);
  const [composerSentAt, setComposerSentAt] = useState<Date | null>(null);

  useEffect(() => {
    if (!leadId) return;
    setNotes(lead?.notes ?? "");
    setNotesDirty(false);
    setComposerOpen(false);
    setComposerText("");
    setSendingChannelAccountId("");
    setComposerError(null);
    setComposerSentAt(null);
  }, [leadId, lead?.notes]);

  const sendableAccounts = useMemo(() => {
    const rows = telegramAccountsQuery.data?.items ?? [];
    return rows.filter((account) => {
      const channelAccountId = (account.channelAccountId ?? "").trim();
      if (!channelAccountId) return false;
      if (account.sendingEnabled === false) return false;
      if ((account.channelStatus ?? "").toLowerCase() === "disconnected") return false;
      return true;
    });
  }, [telegramAccountsQuery.data?.items]);

  useEffect(() => {
    if (!composerOpen || !lead) return;
    if (sendingChannelAccountId) {
      const stillExists = sendableAccounts.some((account) => account.channelAccountId === sendingChannelAccountId);
      if (stillExists) return;
    }

    const parsingAccount = sendableAccounts.find((account) => account.telegramAccountId === lead.telegramAccountId);
    if (parsingAccount?.channelAccountId) {
      setSendingChannelAccountId(parsingAccount.channelAccountId);
      return;
    }

    setSendingChannelAccountId(sendableAccounts[0]?.channelAccountId ?? "");
  }, [composerOpen, lead, sendableAccounts, sendingChannelAccountId]);

  const status = lead?.status ?? "new";
  const title = useMemo(() => {
    if (!lead) return "Lead";
    const name = lead.displayName?.trim() || (lead.username ? `@${lead.username}` : "\u2014");
    return name;
  }, [lead]);

  const telegramProfileUrl = useMemo(() => {
    if (!lead) return null;
    const username = (lead.username ?? "").trim().replace(/^@/, "");
    if (username) return `https://t.me/${encodeURIComponent(username)}`;
    const id = (lead.telegramUserId ?? "").trim();
    // Web t.me doesn't support opening a private user by numeric id.
    // `tg://user?id=` works when Telegram client is installed.
    if (id) return `tg://user?id=${encodeURIComponent(id)}`;
    return null;
  }, [lead]);

  if (!leadId) return null;

  const canMessageLead = Boolean((lead?.username ?? "").trim() || (lead?.telegramUserId ?? "").trim());
  const parsingAccount = leadQuery.data?.parsingAccount ?? lead?.parsingAccount ?? null;
  const isParsingAccountSendable = Boolean(
    parsingAccount &&
      parsingAccount.sendingEnabled &&
      String(parsingAccount.status).toUpperCase() !== "DISCONNECTED"
  );

  const generateFirstMessage = async () => {
    if (!lead) return;
    if (actions.generateFirstMessage.isPending) return;
    setComposerError(null);
    setComposerSentAt(null);
    setComposerOpen(true);
    try {
      const res = await actions.generateFirstMessage.mutateAsync(lead.id);
      const text = (res?.text ?? "").trim();
      setComposerText(text || "");
      if (!text) {
        setComposerError("Could not generate message draft");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not generate message";
      setComposerError(msg);
    }
  };

  const sendFirstMessage = async () => {
    if (!lead) return;
    if (actions.sendFirstMessage.isPending) return;
    const text = composerText.trim();
    if (!text) return;
    setComposerError(null);
    try {
      await actions.sendFirstMessage.mutateAsync({
        leadId: lead.id,
        text,
        channelAccountId: sendingChannelAccountId || undefined
      });
      setComposerSentAt(new Date());
    } catch (err) {
      if (isLeadRadarSendingSelectionError(err)) {
        setSendingChannelAccountId("");
        setComposerError("Sending account unavailable. Pick another.");
        return;
      }
      const msg = err instanceof Error ? err.message : "Could not send message";
      setComposerError(msg);
    }
  };

  const genPending = actions.generateFirstMessage.isPending;
  const sendPending = actions.sendFirstMessage.isPending;
  const composerBusy = genPending || sendPending;
  const hasSendableAccount = sendableAccounts.length > 0;

  return (
    <aside className="fixed right-0 top-0 z-40 flex h-dvh w-full max-w-[520px] flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <div className="truncate text-base font-semibold">{title}</div>
          <div className="truncate text-xs text-muted-foreground">
            {lead?.chatTitle ?? lead?.chatId ?? "\u2014"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="destructive"
            size="sm"
            disabled={!lead || actions.removeLead?.isPending}
            onClick={async () => {
              if (!lead) return;
              const ok = window.confirm(
                "Delete this lead from Inbox LeadRadar? This deletes the lead record and its context/history. This cannot be undone."
              );
              if (!ok) return;
              try {
                await actions.removeLead.mutateAsync(lead.id);
                onClose();
              } catch (err) {
                const msg = err instanceof Error ? err.message : "Could not delete lead";
                window.alert(`Delete failed: ${msg}`);
              }
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
        {leadQuery.isLoading ? <LoadingState label="Loading lead\u2026" /> : null}

        {leadQuery.error ? (
          <EmptyState
            title="Error"
            description={leadQuery.error instanceof Error ? leadQuery.error.message : "Could not load lead"}
          />
        ) : null}

        {!leadQuery.isLoading && !leadQuery.error && !lead ? (
          <EmptyState title="Lead not found" description="It may have been deleted or is unavailable." />
        ) : null}

        {lead ? (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Overview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className={statusBadgeClassName(lead.status)}>{lead.status}</Badge>
                  <span className="text-muted-foreground">score:</span> <span className="font-medium">{lead.score}</span>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Message</div>
                  <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">
                    {(lead.messageText ?? "").trim() || "\u2014"}
                  </div>
                </div>
                {lead.sourceType === "channel_comments" ? (
                  <div className="grid gap-2 md:grid-cols-3">
                    <div>
                      <div className="text-xs text-muted-foreground">Type</div>
                      <div className="font-medium">
                        <Badge variant="outline">Channel comment</Badge>
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Post ID</div>
                      <div className="font-medium">{lead.relatedPostId ?? "\u2014"}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Source type</div>
                      <div className="font-medium">{lead.sourceType ?? "\u2014"}</div>
                    </div>
                  </div>
                ) : null}
                {lead.contextPreview?.trim() ? (
                  <div>
                    <div className="text-xs text-muted-foreground">Context preview (post)</div>
                    <div className="whitespace-pre-wrap rounded-md border border-border bg-muted/20 p-3">
                      {lead.contextPreview}
                    </div>
                  </div>
                ) : null}
                <div className="grid gap-2 md:grid-cols-3">
                  <div>
                    <div className="text-xs text-muted-foreground">Username</div>
                    <div className="font-medium">{lead.username ? `@${lead.username}` : "\u2014"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Telegram ID</div>
                    <div className="font-medium">{lead.telegramUserId ?? "\u2014"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Created</div>
                    <div className="font-medium">{formatDate(lead.createdAt)}</div>
                  </div>
                </div>
                <div className="rounded-md border border-border bg-muted/10 p-2">
                  <div className="text-xs text-muted-foreground">Found via</div>
                  <div className="font-medium">
                    {parsingAccount?.title?.trim()
                      ? parsingAccount.title
                      : parsingAccount?.channelAccountId
                        ? `Account ${parsingAccount.channelAccountId.slice(0, 8)}`
                        : "unknown account"}
                  </div>
                  {parsingAccount ? (
                    <div className="text-xs text-muted-foreground">
                      {parsingAccount.status}
                      {parsingAccount.isPrimary ? " \u00b7 Primary" : ""}
                      {!parsingAccount.parsingEnabled ? " \u00b7 Parsing off" : ""}
                    </div>
                  ) : null}
                </div>

                <div className="pt-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {telegramProfileUrl ? (
                      <a
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                        href={telegramProfileUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open in Telegram
                      </a>
                    ) : (
                      <Button variant="outline" size="sm" disabled title="Missing username or Telegram ID">
                        Open in Telegram
                      </Button>
                    )}

                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={!lead || !canMessageLead || composerBusy}
                      title={!canMessageLead ? "Missing username or Telegram ID" : undefined}
                      onClick={generateFirstMessage}
                    >
                      Generate message
                    </Button>
                  </div>
                </div>

                {composerOpen ? (
                  <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/10 p-3">
                    <div className="text-xs font-medium">First message</div>
                    <Textarea
                      value={composerText}
                      onChange={(e) => setComposerText(e.target.value)}
                      placeholder={"Message text\u2026"}
                      rows={4}
                      disabled={composerBusy}
                    />
                    <div className="space-y-1">
                      <div className="text-xs text-muted-foreground">Send from account</div>
                      <Select
                        value={sendingChannelAccountId}
                        onChange={(e) => setSendingChannelAccountId(e.target.value)}
                        disabled={composerBusy || !hasSendableAccount}
                        options={sendableAccounts.map((account) => ({
                          value: account.channelAccountId ?? "",
                          label: [
                            account.displayName?.trim() ||
                              (account.username ? `@${account.username}` : `Account ${String(account.channelAccountId).slice(0, 8)}`),
                            account.isPrimary ? "Primary" : null,
                            "Outbound"
                          ]
                            .filter(Boolean)
                            .join(" \u00b7 ")
                        }))}
                      />
                      {!hasSendableAccount ? (
                        <div className="text-xs text-destructive">No sending account available</div>
                      ) : null}
                      {composerOpen && parsingAccount && !isParsingAccountSendable && hasSendableAccount ? (
                        <div className="text-xs text-amber-700">
                          The account that matched this lead cannot send messages. Pick another sending account.
                        </div>
                      ) : null}
                    </div>
                    {genPending ? <div className="text-xs text-muted-foreground">Generating\u2026</div> : null}
                    {sendPending ? <div className="text-xs text-muted-foreground">Sending\u2026</div> : null}
                    {composerError ? <div className="text-xs text-destructive">{composerError}</div> : null}
                    {composerSentAt ? (
                      <div className="text-xs text-emerald-700 dark:text-emerald-400">
                        {`\u2713 Sent \u00b7 ${formatDate(composerSentAt.toISOString())}`}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          disabled={!composerText.trim() || !canMessageLead || composerBusy || !hasSendableAccount}
                          title={!canMessageLead ? "Missing username or Telegram ID to send" : undefined}
                          onClick={sendFirstMessage}
                        >
                          Send
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          disabled={composerBusy}
                          onClick={generateFirstMessage}
                        >
                          Regenerate
                        </Button>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={composerBusy}
                        onClick={() => {
                          setComposerOpen(false);
                          setComposerError(null);
                          setComposerSentAt(null);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : null}
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
                  placeholder={"Notes about this lead\u2026"}
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-muted-foreground">
                    {notesDirty ? "You have unsaved changes" : " "}
                  </div>
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
                      <div className="text-muted-foreground">{"\u2014"}</div>
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
                      <div className="text-muted-foreground">{"\u2014"}</div>
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
                  <div className="text-muted-foreground">{"\u2014"}</div>
                ) : (
                  events.map((e) => (
                    <div key={e.id} className="rounded-md border border-border bg-muted/10 p-2">
                      <div className="font-medium">{e.eventType}</div>
                      {e.newStatus ? (
                        <div className="text-muted-foreground">{"\u2192 "} {e.newStatus}</div>
                      ) : null}
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



