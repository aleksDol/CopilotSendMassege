import { apiClient } from "./client";
import type { TelegramAccountResponse } from "./types";

export const telegramApi = {
  account: (token: string) => apiClient.get<TelegramAccountResponse>("/telegram/account", { token }),
  startConnect: (token: string, phone: string) =>
    apiClient.post<{ status: string; requiresPassword?: boolean }>("/telegram/connect/start", { phone }, { token }),
  verifyCode: (token: string, phone: string, code: string) =>
    apiClient.post<{ status: string; requiresPassword?: boolean }>("/telegram/connect/verify-code", { phone, code }, { token }),
  verifyPassword: (token: string, phone: string, password: string) =>
    apiClient.post<{ status: string; requiresPassword?: boolean }>(
      "/telegram/connect/verify-password",
      { phone, password },
      { token }
    ),
  sync: (token: string) => apiClient.post<{ status: string }>("/telegram/sync", {}, { token })
};
