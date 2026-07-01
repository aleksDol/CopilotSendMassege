import { apiClient } from "./client";
import type {
  LeadRadarLeadDetailsResponse,
  LeadRadarLeadItem,
  LeadRadarLeadListResponse,
  LeadRadarLeadStatus,
  LeadRadarKeywordTarget,
  LeadRadarListKeywordsResponse,
  LeadRadarListNegativeKeywordsResponse,
  LeadRadarListSourcesResponse,
  LeadRadarAiSetupPreviewResponse,
  LeadRadarSettingsResponse,
  LeadRadarSourceItem
} from "./types";

export const leadradarApi = {
  listLeads: (
    token: string,
    params: {
      status?: LeadRadarLeadStatus | "all";
      search?: string;
      page: number;
      limit: number;
      sortBy?: "created_at" | "message_date" | "score";
      sortOrder?: "asc" | "desc";
      channelAccountId?: string;
    }
  ) =>
    apiClient.get<LeadRadarLeadListResponse>("/leadradar/leads", {
      token,
      query: {
        status: params.status && params.status !== "all" ? params.status : undefined,
        search: params.search,
        page: params.page,
        limit: params.limit,
        sortBy: params.sortBy,
        sortOrder: params.sortOrder,
        channelAccountId: params.channelAccountId
      }
    }),

  updateLeadStatus: (token: string, leadId: string, status: LeadRadarLeadStatus, channelAccountId?: string) =>
    apiClient.patch(`/leadradar/leads/${leadId}/status`, { status }, { token, query: { channelAccountId } }),

  getLead: (token: string, leadId: string, channelAccountId?: string) =>
    apiClient.get<LeadRadarLeadDetailsResponse>(`/leadradar/leads/${leadId}`, { token, query: { channelAccountId } }),

  updateLeadNotes: (token: string, leadId: string, notes: string | null, channelAccountId?: string) =>
    apiClient.patch(`/leadradar/leads/${leadId}/notes`, { notes }, { token, query: { channelAccountId } }),

  createManualLead: (token: string, input: { name?: string | null; username: string; comment: string }, channelAccountId?: string) =>
    apiClient.post<LeadRadarLeadItem>("/leadradar/leads/manual", input, { token, query: { channelAccountId } }),

  generateFirstMessage: (token: string, leadId: string, channelAccountId?: string) =>
    apiClient.post<{ text: string }>(`/leadradar/leads/${leadId}/first-message/generate`, {}, { token, query: { channelAccountId } }),

  sendFirstMessage: (
    token: string,
    leadId: string,
    text: string,
    channelAccountId?: string,
    parsingChannelAccountId?: string
  ) =>
    apiClient.post<{ ok: boolean; sendStatus: string; lead: unknown }>(
      `/leadradar/leads/${leadId}/first-message/send`,
      { text, channelAccountId },
      { token, query: { channelAccountId: parsingChannelAccountId } }
    ),

  removeLead: (token: string, leadId: string, channelAccountId?: string) =>
    apiClient.delete(`/leadradar/leads/${leadId}`, { token, query: { channelAccountId } }),

  // ===== Sources =====
  listSources: (token: string, channelAccountId?: string) =>
    apiClient.get<LeadRadarListSourcesResponse>("/leadradar/sources", { token, query: { channelAccountId } }),
  addSource: (
    token: string,
    input: { telegramChatId: string; chatTitle?: string | null; chatType?: string | null },
    channelAccountId?: string
  ) => apiClient.post<LeadRadarSourceItem>("/leadradar/sources", input, { token, query: { channelAccountId } }),
  addSourceByLink: (token: string, input: { link: string }, channelAccountId?: string) =>
    apiClient.post<LeadRadarSourceItem>("/leadradar/sources/by-link", input, { token, query: { channelAccountId } }),
  updateSource: (token: string, id: string, input: { isActive: boolean }, channelAccountId?: string) =>
    apiClient.patch<LeadRadarSourceItem>(`/leadradar/sources/${id}`, input, { token, query: { channelAccountId } }),
  removeSource: (token: string, id: string, channelAccountId?: string) =>
    apiClient.delete(`/leadradar/sources/${id}`, { token, query: { channelAccountId } }),

  // ===== Keywords =====
  listKeywords: (token: string, params?: { is_active?: boolean; category?: string; channelAccountId?: string }) =>
    apiClient.get<LeadRadarListKeywordsResponse>("/leadradar/keywords", {
      token,
      query: {
        is_active: typeof params?.is_active === "boolean" ? params.is_active : undefined,
        category: params?.category,
        channelAccountId: params?.channelAccountId
      }
    }).then((res) => ({
      ...res,
      items: (res.items ?? []).map((item) => ({
        ...item,
        target: item.target === "author_profile" ? "author_profile" : "message"
      }))
    })),
  addKeyword: (
    token: string,
    input: { keyword: string; target?: LeadRadarKeywordTarget; matchType: string; category: string; priority?: number },
    channelAccountId?: string
  ) => apiClient.post("/leadradar/keywords", input, { token, query: { channelAccountId } }),
  updateKeyword: (
    token: string,
    id: string,
    patch: Partial<{
      keyword: string;
      target: LeadRadarKeywordTarget;
      matchType: string;
      category: string;
      priority: number;
      isActive: boolean;
    }>,
    channelAccountId?: string
  ) => apiClient.patch(`/leadradar/keywords/${id}`, patch, { token, query: { channelAccountId } }),
  removeKeyword: (token: string, id: string, channelAccountId?: string) =>
    apiClient.delete(`/leadradar/keywords/${id}`, { token, query: { channelAccountId } }),
  bulkAddKeywords: (
    token: string,
    input: {
      channelAccountId: string;
      keywords: Array<{
        keyword: string;
        matchType: string;
        target?: LeadRadarKeywordTarget;
        category: string;
        priority?: number;
      }>;
    }
  ) =>
    apiClient.post<{ createdCount: number; skippedCount: number }>("/leadradar/keywords/bulk", input, { token }),

  // ===== Negative keywords =====
  listNegativeKeywords: (token: string, channelAccountId?: string) =>
    apiClient.get<LeadRadarListNegativeKeywordsResponse>("/leadradar/negative-keywords", { token, query: { channelAccountId } }),
  addNegativeKeyword: (token: string, input: { phrase: string }, channelAccountId?: string) =>
    apiClient.post("/leadradar/negative-keywords", input, { token, query: { channelAccountId } }),
  updateNegativeKeyword: (token: string, id: string, patch: Partial<{ phrase: string; isActive: boolean }>, channelAccountId?: string) =>
    apiClient.patch(`/leadradar/negative-keywords/${id}`, patch, { token, query: { channelAccountId } }),
  removeNegativeKeyword: (token: string, id: string, channelAccountId?: string) =>
    apiClient.delete(`/leadradar/negative-keywords/${id}`, { token, query: { channelAccountId } }),

  // ===== Settings =====
  getSettings: (token: string, channelAccountId?: string) =>
    apiClient.get<LeadRadarSettingsResponse>("/leadradar/settings", { token, query: { channelAccountId } }),
  updateSettings: (
    token: string,
    patch: Partial<{
      isEnabled: boolean;
      authorProfileMatchingEnabled: boolean;
      minScoreThreshold: number;
      storeContextEnabled: boolean;
      contextBeforeCount: number;
      contextAfterCount: number;
      dedupeWindowHours: number;
      coldFirstTouchPlaybook: string | null;
    }>,
    channelAccountId?: string
  ) => apiClient.patch<LeadRadarSettingsResponse>("/leadradar/settings", patch, { token, query: { channelAccountId } }),

  generateAiSetup: (token: string, input: { description: string }) =>
    apiClient.post<LeadRadarAiSetupPreviewResponse>("/leadradar/ai-setup/generate", input, { token })
};
