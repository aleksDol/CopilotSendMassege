import { apiClient } from "./client";
import type { CommentCandidate, CommentCandidateStatus } from "./types";

export const commentingApi = {
  listCandidates: (token: string, query?: { status?: CommentCandidateStatus; limit?: number }) =>
    apiClient.get<{ items: CommentCandidate[] }>("/commenting/candidates", {
      token,
      query: {
        status: query?.status,
        limit: query?.limit
      }
    }),

  getCandidate: (token: string, id: string) => apiClient.get<{ item: CommentCandidate }>(`/commenting/${id}`, { token }),

  updateCandidate: (token: string, id: string, aiComment: string) =>
    apiClient.post<{ item: CommentCandidate }>(`/commenting/${id}/update`, { aiComment }, { token }),

  ignoreCandidate: (token: string, id: string) =>
    apiClient.post<{ item: CommentCandidate }>(`/commenting/${id}/ignore`, {}, { token }),

  publishCandidate: (token: string, id: string) =>
    apiClient.post<{ item: CommentCandidate; alreadyPublished?: boolean }>(`/commenting/${id}/publish`, {}, { token })
};
