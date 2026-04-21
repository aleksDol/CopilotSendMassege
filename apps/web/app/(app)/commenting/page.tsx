"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { commentingApi, type CommentCandidate } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import { ApiError } from "@/lib/api/errors";

const baseScopeKey = (companyId: string | undefined, userId: string | undefined) =>
  `${companyId ?? ""}:${userId ?? ""}`;

const preview = (text: string, max = 110) => {
  const normalized = text.trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}...`;
};

const statusBadgeVariant = (status: CommentCandidate["status"]): "secondary" | "success" | "outline" => {
  if (status === "new") return "secondary";
  if (status === "published") return "success";
  return "outline";
};

const statusLabel = (status: CommentCandidate["status"]) => {
  if (status === "new") return "New";
  if (status === "published") return "Published";
  return "Ignored";
};

const toTelegramChannelInternalId = (channelId: string) => {
  const m = channelId.trim().match(/^-100(\d+)$/);
  return m?.[1] ?? null;
};

const toTelegramPostUrl = (channelId: string, postId: string) => {
  const internalId = toTelegramChannelInternalId(channelId);
  const post = postId.trim();
  if (!internalId || !post) return null;
  // Works for private channels/supergroups where you have access.
  return `https://t.me/c/${internalId}/${encodeURIComponent(post)}`;
};

export default function CommentingPage() {
  const { token, company, user } = useAuth();
  const queryClient = useQueryClient();
  const scope = baseScopeKey(company?.id, user?.id);

  const [activeTab, setActiveTab] = useState<"feed" | "stats">("feed");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [excludeChannelId, setExcludeChannelId] = useState("");
  const [onlyNew, setOnlyNew] = useState(false);
  const [autoConfirmOpen, setAutoConfirmOpen] = useState(false);
  const [pendingAutoEnabled, setPendingAutoEnabled] = useState<boolean | null>(null);

  const stateQuery = useQuery({
    queryKey: ["commenting-state", scope],
    queryFn: () => commentingApi.getState(token ?? ""),
    enabled: Boolean(token)
  });

  const autoEnabled = Boolean(stateQuery.data?.autoCommentingEnabled);
  const autoPausedUntil = stateQuery.data?.autoCommentingPausedUntil ?? null;
  const isAutoActive = autoEnabled && !autoPausedUntil;

  const setAutoModeMutation = useMutation({
    mutationFn: (enabled: boolean) => commentingApi.setAutoMode(token ?? "", enabled),
    onSuccess: async () => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["commenting-state", scope] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-stats", scope] })
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to update auto mode");
      setActionInfo(null);
    }
  });

  const statsQuery = useQuery({
    queryKey: ["commenting-stats", scope],
    queryFn: () => commentingApi.getStats(token ?? ""),
    enabled: Boolean(token && activeTab === "stats")
  });

  const candidatesQuery = useQuery({
    queryKey: ["commenting-candidates", scope, onlyNew],
    queryFn: () => commentingApi.listCandidates(token ?? "", { limit: 100, onlyNew }),
    enabled: Boolean(token && activeTab === "feed")
  });

  const candidates = candidatesQuery.data?.items ?? [];

  // IMPORTANT: do not auto-mark as seen on load.
  // It can hide existing candidates after any UI action (e.g. exclusions update).

  useEffect(() => {
    if (selectedId && candidates.some((item) => item.id === selectedId)) return;
    setSelectedId(candidates[0]?.id ?? null);
  }, [candidates, selectedId]);

  const selectedListItem = useMemo(
    () => candidates.find((item) => item.id === selectedId) ?? null,
    [candidates, selectedId]
  );

  const candidateQuery = useQuery({
    queryKey: ["commenting-candidate", scope, selectedId],
    queryFn: () => commentingApi.getCandidate(token ?? "", selectedId ?? ""),
    enabled: Boolean(token && selectedId)
  });

  const selectedCandidate = candidateQuery.data?.item ?? selectedListItem;

  useEffect(() => {
    setIsEditing(false);
    setDraftComment(selectedCandidate?.aiComment ?? "");
    setActionError(null);
    setActionInfo(null);
  }, [selectedCandidate?.id, selectedCandidate?.aiComment]);

  const applyCandidateToCache = (next: CommentCandidate) => {
    queryClient.setQueryData<{ item: CommentCandidate }>(["commenting-candidate", scope, next.id], { item: next });
    const updateListCache = (key: unknown[]) => {
      queryClient.setQueryData<
        { items: CommentCandidate[]; lastSeenAt?: string; excludedChannelIds?: string[] } | undefined
      >(key, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          items: prev.items.map((item) => (item.id === next.id ? next : item))
        };
      });
    };

    updateListCache(["commenting-candidates", scope, false]);
    updateListCache(["commenting-candidates", scope, true]);
  };

  const updateMutation = useMutation({
    mutationFn: (aiComment: string) => commentingApi.updateCandidate(token ?? "", selectedId ?? "", aiComment),
    onSuccess: ({ item }) => {
      applyCandidateToCache(item);
      setIsEditing(false);
      setActionInfo("Comment saved.");
      setActionError(null);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to save comment");
      setActionInfo(null);
    }
  });

  const ignoreMutation = useMutation({
    mutationFn: () => commentingApi.ignoreCandidate(token ?? "", selectedId ?? ""),
    onSuccess: ({ item }) => {
      applyCandidateToCache(item);
      setActionInfo("Candidate ignored.");
      setActionError(null);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to ignore candidate");
      setActionInfo(null);
    }
  });

  const publishMutation = useMutation({
    mutationFn: () => commentingApi.publishCandidate(token ?? "", selectedId ?? ""),
    onSuccess: ({ item, alreadyPublished }) => {
      applyCandidateToCache(item);
      setActionInfo(alreadyPublished ? "Already published." : "Candidate published.");
      setActionError(null);
      // Ensure list + selected item are in sync with backend after publish.
      void Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["commenting-candidate", scope, item.id] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope, false] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope, true] })
      ]);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "DISCUSSION_JOIN_REQUIRED") {
        setActionError(
          "Нельзя отправить комментарий: подключённый Telegram-аккаунт не состоит в группе обсуждений (discussion group) этого канала. Вступите в группу обсуждений под этим аккаунтом (или добавьте его), затем повторите отправку."
        );
      } else if (error instanceof ApiError && (error.code === "NEW_CONVERSATION_RATE_LIMIT" || error.code === "SEND_RATE_LIMIT_PER_MINUTE" || error.code === "SEND_RATE_LIMIT_PER_5_MINUTES" || error.code === "TELEGRAM_LIMITED" || error.code === "TELEGRAM_THROTTLED" || error.code === "SAFETY_MODE_ACTIVE")) {
        const retryAfterSeconds =
          typeof (error.details as any)?.retryAfterSeconds === "number" ? (error.details as any).retryAfterSeconds : null;
        setActionError(
          retryAfterSeconds
            ? `Telegram ограничил отправку. Подождите ${Math.max(1, Math.round(retryAfterSeconds))} сек. и повторите.`
            : "Telegram ограничил отправку. Подождите немного и повторите."
        );
      } else {
        setActionError(error instanceof Error ? error.message : "Failed to publish candidate");
      }
      setActionInfo(null);
    }
  });

  const addExclusionMutation = useMutation({
    mutationFn: (channelId: string) => commentingApi.addExclusion(token ?? "", channelId),
    onSuccess: async () => {
      setExcludeChannelId("");
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["commenting-state", scope] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope, false] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope, true] })
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to add exclusion");
      setActionInfo(null);
    }
  });

  const removeExclusionMutation = useMutation({
    mutationFn: (channelId: string) => commentingApi.removeExclusion(token ?? "", channelId),
    onSuccess: async () => {
      await Promise.allSettled([
        queryClient.invalidateQueries({ queryKey: ["commenting-state", scope] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope, false] }),
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope, true] })
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to remove exclusion");
      setActionInfo(null);
    }
  });

  if (activeTab === "feed" && candidatesQuery.isLoading) {
    return <LoadingState label="Loading comment candidates..." />;
  }

  if (activeTab === "feed" && !candidates.length) {
    return (
      <EmptyState
        title={onlyNew ? "Нет новых постов" : "No comment candidates yet"}
        description={
          onlyNew
            ? "Новые кандидаты появятся, когда в отслеживаемых каналах выйдут свежие посты."
            : "When Telegram channel posts are ingested, AI comment candidates will appear here."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Commenting</h1>
            <p className="text-sm text-muted-foreground">Browse channel posts, edit AI suggestions, and publish comments.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {isAutoActive ? <Badge variant="success">Auto mode is active</Badge> : null}
            {autoEnabled && autoPausedUntil ? (
              <Badge variant="secondary" title={`Paused until ${new Date(autoPausedUntil).toLocaleString()}`}>
                Auto paused
              </Badge>
            ) : null}

            <label className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm">
              <span className="font-medium">Auto Commenting</span>
              <span className="text-muted-foreground">{autoEnabled ? "ON" : "OFF"}</span>
              <input
                type="checkbox"
                checked={autoEnabled}
                onChange={(e) => {
                  const next = e.target.checked;
                  setActionError(null);
                  setActionInfo(null);
                  if (next) {
                    setPendingAutoEnabled(true);
                    setAutoConfirmOpen(true);
                    return;
                  }
                  setAutoModeMutation.mutate(false);
                }}
                disabled={!token || setAutoModeMutation.isPending}
              />
            </label>
          </div>
        </div>

        <div className="mt-3 flex gap-2">
          <Button
            variant={activeTab === "feed" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("feed")}
          >
            Feed
          </Button>
          <Button
            variant={activeTab === "stats" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("stats")}
          >
            Stats
          </Button>
        </div>
      </div>

      {activeTab === "feed" ? (
        <Card>
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Фильтры</div>
        <div className="space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={onlyNew}
              onChange={(e) => {
                setOnlyNew(e.target.checked);
              }}
            />
            Только новые (после последнего “просмотрено”)
          </label>

          <Button
            variant="outline"
            size="sm"
            onClick={() => commentingApi.markSeen(token ?? "").then(() => queryClient.invalidateQueries({ queryKey: ["commenting-state", scope] }))}
            disabled={!token}
          >
            Отметить как просмотренное
          </Button>

          <div className="text-sm font-medium">Минус‑список каналов</div>
          <div className="flex flex-wrap gap-2">
            <input
              value={excludeChannelId}
              onChange={(e) => setExcludeChannelId(e.target.value)}
              placeholder="Напр. -1001234567890"
              className="h-9 w-[260px] rounded-md border border-border bg-background px-3 text-sm"
            />
            <Button
              variant="outline"
              onClick={() => addExclusionMutation.mutate(excludeChannelId)}
              disabled={!excludeChannelId.trim().length || addExclusionMutation.isPending}
            >
              {addExclusionMutation.isPending ? "Добавляю..." : "Добавить"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(stateQuery.data?.exclusions ?? []).map((e) => (
              <Button
                key={e.channelId}
                variant="outline"
                size="sm"
                onClick={() => removeExclusionMutation.mutate(e.channelId)}
                disabled={removeExclusionMutation.isPending}
                title="Удалить из минус-списка"
              >
                {e.channelId} ×
              </Button>
            ))}
          </div>

          {stateQuery.data?.lastSeenAt ? (
            <div className="text-xs text-muted-foreground">
              Последнее “просмотрено”:{" "}
              {new Date(stateQuery.data.lastSeenAt).toLocaleString()}
            </div>
          ) : null}
        </div>
        </Card>
      ) : null}

      {activeTab === "stats" ? (
        <Card>
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Stats</div>
          <div className="space-y-3 p-4 text-sm">
            {statsQuery.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading stats...</div>
            ) : statsQuery.data ? (
              <div className="grid gap-3 md:grid-cols-2">
                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Auto mode</div>
                  <div className="mt-1 text-lg font-semibold">{statsQuery.data.autoMode.enabled ? "ON" : "OFF"}</div>
                  {statsQuery.data.autoMode.pausedUntil ? (
                    <div className="mt-1 text-xs text-muted-foreground">
                      Paused until: {new Date(statsQuery.data.autoMode.pausedUntil).toLocaleString()}
                    </div>
                  ) : null}
                  {statsQuery.data.autoMode.pauseReason ? (
                    <div className="mt-1 text-xs text-muted-foreground">Reason: {statsQuery.data.autoMode.pauseReason}</div>
                  ) : null}
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Auto published</div>
                  <div className="mt-1 text-lg font-semibold">{statsQuery.data.totals.autoPublished}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Today: {statsQuery.data.windows.autoPublishedToday} · This week: {statsQuery.data.windows.autoPublishedThisWeek}
                  </div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Published successfully</div>
                  <div className="mt-1 text-lg font-semibold">{statsQuery.data.publishedSuccessfully}</div>
                  <div className="mt-1 text-xs text-muted-foreground">Manual published: {statsQuery.data.totals.manualPublished}</div>
                </Card>

                <Card className="p-4">
                  <div className="text-xs text-muted-foreground">Failed (auto)</div>
                  <div className="mt-1 text-lg font-semibold">{statsQuery.data.failedAutoPublishes}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Last published at:{" "}
                    {statsQuery.data.lastAutoPublishedAt ? new Date(statsQuery.data.lastAutoPublishedAt).toLocaleString() : "—"}
                  </div>
                </Card>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No stats yet.</div>
            )}
          </div>
        </Card>
      ) : null}

      {activeTab === "feed" ? (
        <div className="grid min-h-[70vh] grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)_380px]">
        <Card className="min-h-0 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Candidates</div>
          <div className="max-h-[70vh] space-y-2 overflow-y-auto p-2">
            {candidates.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelectedId(item.id)}
                className={`w-full rounded-lg border p-3 text-left transition ${
                  item.id === selectedId ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                }`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="truncate text-xs text-muted-foreground">
                    {(() => {
                      const url = toTelegramPostUrl(item.channelId, item.postId);
                      return url ? (
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="underline underline-offset-2 hover:text-foreground"
                          onClick={(e) => e.stopPropagation()}
                          title="Open post in Telegram"
                        >
                          Open in Telegram
                        </a>
                      ) : (
                        <>Channel: {item.channelId}</>
                      );
                    })()}
                  </div>
                  <Badge variant={statusBadgeVariant(item.status)}>{statusLabel(item.status)}</Badge>
                </div>
                <div className="text-sm">{preview(item.postText)}</div>
              </button>
            ))}
          </div>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">Post</div>
          <div className="max-h-[70vh] overflow-y-auto p-4">
            {selectedCandidate ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(() => {
                    const url = toTelegramPostUrl(selectedCandidate.channelId, selectedCandidate.postId);
                    return url ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => window.open(url, "_blank", "noreferrer")}
                      >
                        Open post in Telegram
                      </Button>
                    ) : null;
                  })()}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard?.writeText(selectedCandidate.channelId).catch(() => {})}
                  >
                    Copy channel ID
                  </Button>
                </div>
                <div className="whitespace-pre-wrap text-sm leading-6 text-foreground">{selectedCandidate.postText}</div>
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">Select a candidate.</div>
            )}
          </div>
        </Card>

        <Card className="min-h-0 overflow-hidden">
          <div className="border-b border-border px-4 py-3 text-sm font-semibold">AI Comment</div>
          <div className="space-y-3 p-4">
            <Textarea
              value={draftComment}
              onChange={(event) => setDraftComment(event.target.value)}
              disabled={!selectedCandidate || !isEditing || updateMutation.isPending}
              className="min-h-[220px]"
              placeholder="No suggestion yet..."
            />

            <div className="flex flex-wrap gap-2">
              {!isEditing ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsEditing(true);
                    setActionInfo(null);
                    setActionError(null);
                  }}
                  disabled={!selectedCandidate}
                >
                  Edit
                </Button>
              ) : (
                <Button
                  onClick={() => updateMutation.mutate(draftComment)}
                  disabled={!selectedCandidate || !draftComment.trim().length || updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Saving..." : "Save"}
                </Button>
              )}

              <Button
                onClick={() => publishMutation.mutate()}
                disabled={!selectedCandidate || !selectedCandidate.aiComment?.trim() || selectedCandidate.status === "published" || publishMutation.isPending}
              >
                {publishMutation.isPending ? "Publishing..." : "Publish"}
              </Button>

              <Button
                variant="outline"
                onClick={() => ignoreMutation.mutate()}
                disabled={!selectedCandidate || selectedCandidate.status === "ignored" || ignoreMutation.isPending}
              >
                {ignoreMutation.isPending ? "Ignoring..." : "Ignore"}
              </Button>
            </div>

            {actionInfo ? <div className="text-xs text-muted-foreground">{actionInfo}</div> : null}
            {actionError ? <div className="text-xs text-destructive">{actionError}</div> : null}
          </div>
        </Card>
      </div>
      ) : null}

      {autoConfirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <div className="border-b border-border px-4 py-3 text-sm font-semibold">Enable Auto Commenting</div>
            <div className="space-y-3 p-4 text-sm">
              <div className="text-muted-foreground">
                Комментарии будут публиковаться автоматически от имени вашего Telegram аккаунта. Используйте функцию
                осторожно — активность аккаунта может увеличиться.
              </div>
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setAutoConfirmOpen(false);
                    setPendingAutoEnabled(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => {
                    const next = pendingAutoEnabled === true;
                    setAutoConfirmOpen(false);
                    setPendingAutoEnabled(null);
                    setAutoModeMutation.mutate(next);
                  }}
                >
                  Enable Auto Commenting
                </Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
