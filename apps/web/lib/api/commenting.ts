import { apiClient } from "./client";
import type { CommentCandidate, CommentCandidateStatus, CommentingState, CommentingStats } from "./types";

export const commentingApi = {
  listCandidates: (token: string, query?: { status?: CommentCandidateStatus; limit?: number; onlyNew?: boolean }) =>
    apiClient.get<{ items: CommentCandidate[]; lastSeenAt: string; excludedChannelIds: string[] }>(
      "/commenting/candidates",
      {
      token,
      query: {
        status: query?.status,
        limit: query?.limit,
        onlyNew: typeof query?.onlyNew === "boolean" ? String(query.onlyNew) : undefined
      }
      }
    ),

  getCandidate: (token: string, id: string) => apiClient.get<{ item: CommentCandidate }>(`/commenting/${id}`, { token }),

  updateCandidate: (token: string, id: string, aiComment: string) =>
    apiClient.post<{ item: CommentCandidate }>(`/commenting/${id}/update`, { aiComment }, { token }),

  ignoreCandidate: (token: string, id: string) =>
    apiClient.post<{ item: CommentCandidate }>(`/commenting/${id}/ignore`, {}, { token }),

  publishCandidate: (token: string, id: string) =>
    apiClient.post<{ item: CommentCandidate; alreadyPublished?: boolean }>(`/commenting/${id}/publish`, {}, { token }),

  getState: (token: string) => apiClient.get<CommentingState>("/commenting/state", { token }),
  setAutoMode: (token: string, enabled: boolean) =>
    apiClient.post<CommentingState>("/commenting/auto", { enabled }, { token }),
  getStats: (token: string) => apiClient.get<CommentingStats>("/commenting/stats", { token }),
  markSeen: (token: string, lastSeenAt?: string) => apiClient.post<{ lastSeenAt: string }>(
    "/commenting/state",
    lastSeenAt ? { lastSeenAt } : {},
    { token }
  ),

  addExclusion: (token: string, channelId: string) =>
    apiClient.post<{ items: { channelId: string; createdAt: string }[] }>("/commenting/exclusions", { channelId }, { token }),
  removeExclusion: (token: string, channelId: string) =>
    apiClient.delete<{ items: { channelId: string; createdAt: string }[] }>(`/commenting/exclusions/${encodeURIComponent(channelId)}`, {
      token
    })
};
