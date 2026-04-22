import { apiClient } from "./client";
import type {
  LeadRadarLeadDetailsResponse,
  LeadRadarLeadListResponse,
  LeadRadarLeadStatus,
  LeadRadarListKeywordsResponse,
  LeadRadarListNegativeKeywordsResponse,
  LeadRadarListSourcesResponse,
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
        sortOrder: params.sortOrder
      }
    }),

  updateLeadStatus: (token: string, leadId: string, status: LeadRadarLeadStatus) =>
    apiClient.patch(`/leadradar/leads/${leadId}/status`, { status }, { token }),

  getLead: (token: string, leadId: string) => apiClient.get<LeadRadarLeadDetailsResponse>(`/leadradar/leads/${leadId}`, { token }),

  updateLeadNotes: (token: string, leadId: string, notes: string | null) =>
    apiClient.patch(`/leadradar/leads/${leadId}/notes`, { notes }, { token })

  ,

  generateFirstMessage: (token: string, leadId: string) =>
    apiClient.post<{ text: string }>(`/leadradar/leads/${leadId}/first-message/generate`, {}, { token }),

  sendFirstMessage: (token: string, leadId: string, text: string) =>
    apiClient.post<{ ok: boolean; sendStatus: string; lead: unknown }>(`/leadradar/leads/${leadId}/first-message/send`, { text }, { token }),

  removeLead: (token: string, leadId: string) => apiClient.delete(`/leadradar/leads/${leadId}`, { token }),

  // ===== Sources =====
  listSources: (token: string) => apiClient.get<LeadRadarListSourcesResponse>("/leadradar/sources", { token }),
  addSource: (
    token: string,
    input: { telegramChatId: string; chatTitle?: string | null; chatType?: string | null }
  ) => apiClient.post<LeadRadarSourceItem>("/leadradar/sources", input, { token }),
  addSourceByLink: (token: string, input: { link: string }) =>
    apiClient.post<LeadRadarSourceItem>("/leadradar/sources/by-link", input, { token }),
  updateSource: (token: string, id: string, input: { isActive: boolean }) =>
    apiClient.patch<LeadRadarSourceItem>(`/leadradar/sources/${id}`, input, { token }),
  removeSource: (token: string, id: string) => apiClient.delete(`/leadradar/sources/${id}`, { token }),

  // ===== Keywords =====
  listKeywords: (token: string, params?: { is_active?: boolean; category?: string }) =>
    apiClient.get<LeadRadarListKeywordsResponse>("/leadradar/keywords", {
      token,
      query: {
        is_active: typeof params?.is_active === "boolean" ? params.is_active : undefined,
        category: params?.category
      }
    }),
  addKeyword: (
    token: string,
    input: { keyword: string; matchType: string; category: string; priority?: number }
  ) => apiClient.post("/leadradar/keywords", input, { token }),
  updateKeyword: (
    token: string,
    id: string,
    patch: Partial<{ keyword: string; matchType: string; category: string; priority: number; isActive: boolean }>
  ) => apiClient.patch(`/leadradar/keywords/${id}`, patch, { token }),
  removeKeyword: (token: string, id: string) => apiClient.delete(`/leadradar/keywords/${id}`, { token }),

  // ===== Negative keywords =====
  listNegativeKeywords: (token: string) =>
    apiClient.get<LeadRadarListNegativeKeywordsResponse>("/leadradar/negative-keywords", { token }),
  addNegativeKeyword: (token: string, input: { phrase: string }) =>
    apiClient.post("/leadradar/negative-keywords", input, { token }),
  updateNegativeKeyword: (token: string, id: string, patch: Partial<{ phrase: string; isActive: boolean }>) =>
    apiClient.patch(`/leadradar/negative-keywords/${id}`, patch, { token }),
  removeNegativeKeyword: (token: string, id: string) => apiClient.delete(`/leadradar/negative-keywords/${id}`, { token }),

  // ===== Settings =====
  getSettings: (token: string) => apiClient.get<LeadRadarSettingsResponse>("/leadradar/settings", { token }),
  updateSettings: (
    token: string,
    patch: Partial<{
      isEnabled: boolean;
      minScoreThreshold: number;
      storeContextEnabled: boolean;
      contextBeforeCount: number;
      contextAfterCount: number;
      dedupeWindowHours: number;
    }>
  ) => apiClient.patch<LeadRadarSettingsResponse>("/leadradar/settings", patch, { token })
};

