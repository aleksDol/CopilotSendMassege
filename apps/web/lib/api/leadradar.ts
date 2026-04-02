import { apiClient } from "./client";
import type { LeadRadarLeadDetailsResponse, LeadRadarLeadListResponse, LeadRadarLeadStatus } from "./types";

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
};

