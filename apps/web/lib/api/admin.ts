import { apiClient } from "./client";

export type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string;
  subscriptionStatus: "trial" | "active" | "inactive";
  subscriptionExpiresAt: string | null;
  telegramConnected: boolean;
};

export const adminApi = {
  listUsers: (token: string, query: { search?: string; filter?: string }) =>
    apiClient.get<{ users: AdminUserRow[] }>("/admin/users", { token, query }),

  updateSubscription: (
    token: string,
    userId: string,
    body: { action: "activate" | "deactivate" | "extend"; extendDays?: number }
  ) => apiClient.post<{ ok: true }>(`/admin/users/${userId}/update-subscription`, body, { token })
};
