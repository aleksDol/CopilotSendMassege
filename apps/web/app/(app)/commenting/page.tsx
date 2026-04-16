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

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [draftComment, setDraftComment] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [excludeChannelId, setExcludeChannelId] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [markedSeenOnce, setMarkedSeenOnce] = useState(false);

  const stateQuery = useQuery({
    queryKey: ["commenting-state", scope],
    queryFn: () => commentingApi.getState(token ?? ""),
    enabled: Boolean(token)
  });

  const candidatesQuery = useQuery({
    queryKey: ["commenting-candidates", scope, showAll],
    queryFn: () => commentingApi.listCandidates(token ?? "", { limit: 100, onlyNew: !showAll }),
    enabled: Boolean(token)
  });

  const candidates = candidatesQuery.data?.items ?? [];

  useEffect(() => {
    if (!token) return;
    if (markedSeenOnce) return;
    if (!candidatesQuery.isSuccess) return;
    // Mark as seen once per page load so subsequent opens show only new items.
    commentingApi
      .markSeen(token)
      .then(() => setMarkedSeenOnce(true))
      .catch(() => {
        // best-effort
      });
  }, [token, candidatesQuery.isSuccess, markedSeenOnce]);

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
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope] })
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
        queryClient.invalidateQueries({ queryKey: ["commenting-candidates", scope] })
      ]);
    },
    onError: (error) => {
      setActionError(error instanceof Error ? error.message : "Failed to remove exclusion");
      setActionInfo(null);
    }
  });

  if (candidatesQuery.isLoading) {
    return <LoadingState label="Loading comment candidates..." />;
  }

  if (!candidates.length) {
    return (
      <EmptyState
        title={showAll ? "No comment candidates yet" : "Нет новых постов"}
        description={
          showAll
            ? "When Telegram channel posts are ingested, AI comment candidates will appear here."
            : "Новые кандидаты появятся, когда в отслеживаемых каналах выйдут свежие посты."
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Commenting</h1>
        <p className="text-sm text-muted-foreground">Browse channel posts, edit AI suggestions, and publish comments.</p>
      </div>

      <Card>
        <div className="border-b border-border px-4 py-3 text-sm font-semibold">Фильтры</div>
        <div className="space-y-3 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => {
                setShowAll(e.target.checked);
                setMarkedSeenOnce(false);
              }}
            />
            Показывать все (включая старые)
          </label>

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
              Только новые: показываем кандидаты после{" "}
              {new Date(stateQuery.data.lastSeenAt).toLocaleString()}
            </div>
          ) : null}
        </div>
      </Card>

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
    </div>
  );
}
