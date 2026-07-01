import { apiClient } from "./client";

export type SourceMarketplaceTopicStatus = "draft" | "active" | "hidden";
export type SourceMarketplaceEntryStatus = "active" | "paused" | "blocked" | "review";

export type SourceMarketplaceTopicItem = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string;
  color: string;
  status: SourceMarketplaceTopicStatus;
  sort_order: number;
  entry_count: number;
  created_at: string;
  updated_at: string;
};

export type SourceMarketplaceRecommendationItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sourceCount: number;
  recommended: boolean;
};

export type SourceMarketplaceRecommendationsResponse = {
  items: SourceMarketplaceRecommendationItem[];
  total: number;
  hasRecommendations: boolean;
};

export type SourceMarketplaceSubscribeRunResponse = {
  id: string;
  status: "pending" | "running" | "completed" | "failed";
  totalCount: number;
  joinedCount: number;
  skippedCount: number;
  failedCount: number;
  activeCount: number;
  percent: number;
  lastError: string | null;
};

export type SourceMarketplaceEntryItem = {
  id: string;
  title: string;
  telegram_username: string | null;
  telegram_chat_id: string | null;
  chat_type: string | null;
  status: SourceMarketplaceEntryStatus;
  note: string | null;
  last_checked_at: string | null;
  topic_ids: string[];
  topics: { id: string; name: string; slug: string }[];
  created_at: string;
  updated_at: string;
};

export const sourceMarketplaceApi = {
  getRecommendations: (token: string, chatTopics: string[] = []) =>
    apiClient.get<SourceMarketplaceRecommendationsResponse>("/source-marketplace/recommendations", {
      token,
      query: chatTopics.length ? { chatTopics: JSON.stringify(chatTopics) } : undefined
    }),

  startSubscribe: (
    token: string,
    body: { topicIds: string[]; channelAccountId: string }
  ) => apiClient.post<SourceMarketplaceSubscribeRunResponse>("/source-marketplace/start", body, { token }),

  getSubscribeRun: (token: string, runId: string) =>
    apiClient.get<SourceMarketplaceSubscribeRunResponse>(`/source-marketplace/runs/${runId}`, { token }),

  listTopics: (token: string, query?: { status?: SourceMarketplaceTopicStatus; search?: string }) =>
    apiClient.get<{ items: SourceMarketplaceTopicItem[]; total: number }>("/admin/source-marketplace/topics", {
      token,
      query
    }),

  createTopic: (
    token: string,
    body: {
      name: string;
      slug: string;
      description?: string | null;
      icon?: string;
      color?: string;
      status?: SourceMarketplaceTopicStatus;
      sortOrder?: number;
    }
  ) => apiClient.post<SourceMarketplaceTopicItem>("/admin/source-marketplace/topics", body, { token }),

  updateTopic: (
    token: string,
    id: string,
    body: Partial<{
      name: string;
      slug: string;
      description: string | null;
      icon: string;
      color: string;
      status: SourceMarketplaceTopicStatus;
      sortOrder: number;
    }>
  ) => apiClient.patch<SourceMarketplaceTopicItem>(`/admin/source-marketplace/topics/${id}`, body, { token }),

  deleteTopic: (token: string, id: string) =>
    apiClient.delete<{ ok: true }>(`/admin/source-marketplace/topics/${id}`, { token }),

  listEntries: (
    token: string,
    query?: { status?: SourceMarketplaceEntryStatus; topicId?: string; search?: string }
  ) =>
    apiClient.get<{ items: SourceMarketplaceEntryItem[]; total: number }>("/admin/source-marketplace/entries", {
      token,
      query
    }),

  createEntry: (
    token: string,
    body: {
      title: string;
      telegramUsername?: string | null;
      telegramChatId?: string | null;
      chatType?: string | null;
      status?: SourceMarketplaceEntryStatus;
      note?: string | null;
      lastCheckedAt?: string | null;
      topicIds?: string[];
    }
  ) => apiClient.post<SourceMarketplaceEntryItem>("/admin/source-marketplace/entries", body, { token }),

  updateEntry: (
    token: string,
    id: string,
    body: Partial<{
      title: string;
      telegramUsername: string | null;
      telegramChatId: string | null;
      chatType: string | null;
      status: SourceMarketplaceEntryStatus;
      note: string | null;
      lastCheckedAt: string | null;
      topicIds: string[];
    }>
  ) => apiClient.patch<SourceMarketplaceEntryItem>(`/admin/source-marketplace/entries/${id}`, body, { token }),

  deleteEntry: (token: string, id: string) =>
    apiClient.delete<{ ok: true }>(`/admin/source-marketplace/entries/${id}`, { token })
};
