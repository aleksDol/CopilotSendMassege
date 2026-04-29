import { apiClient } from "./client";
import type { CrmLeadsListResponse } from "./types";

export const crmApi = {
  listLeads: (
    token: string,
    query: {
      limit?: number;
      cursor?: string;
      stage?: string;
      search?: string;
      channelAccountId?: string;
    }
  ) => apiClient.get<CrmLeadsListResponse>("/crm/leads", { token, query })
};
