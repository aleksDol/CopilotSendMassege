import { apiClient } from "./client";
import type { KnowledgeItem, ReplyPolicy } from "./types";

export const settingsApi = {
  listKnowledge: (token: string) => apiClient.get<{ items: KnowledgeItem[] }>("/settings/knowledge", { token }),
  createKnowledge: (
    token: string,
    payload: { kind: string; title: string; content: string; priority: number; isActive: boolean }
  ) => apiClient.post<{ item: KnowledgeItem }>("/settings/knowledge", payload, { token }),
  updateKnowledge: (
    token: string,
    id: string,
    payload: Partial<{ kind: string; title: string; content: string; priority: number; isActive: boolean }>
  ) => apiClient.patch<{ item: KnowledgeItem }>(`/settings/knowledge/${id}`, payload, { token }),
  getReplyPolicy: (token: string) => apiClient.get<{ policy: ReplyPolicy }>("/settings/reply-policy", { token }),
  saveReplyPolicy: (token: string, payload: ReplyPolicy) =>
    apiClient.post<{ policy: ReplyPolicy }>("/settings/reply-policy", payload, { token })
};
