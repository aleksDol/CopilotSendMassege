import { apiClient } from "./client";
import type { TelegramAccountResponse, TelegramAccountsListResponse } from "./types";

export type StartConnectQrResponse = { qrSessionId: string; qrUrl: string; expiresAt: number };
export type PollLoginQrResponse = { status: string; expiresAt: number; errorMessage?: string | null };

export const telegramApi = {
  account: (token: string, channelAccountId?: string) =>
    apiClient.get<TelegramAccountResponse>("/telegram/account", { token, query: { channelAccountId } }),
  accounts: (token: string) => apiClient.get<TelegramAccountsListResponse>("/telegram/accounts", { token }),
  patchAccount: (token: string, channelAccountId: string, payload: { sendingEnabled?: boolean; parsingEnabled?: boolean }) =>
    apiClient.patch<{ channelAccountId: string; sendingEnabled: boolean; parsingEnabled: boolean }>(
      `/telegram/account/${channelAccountId}`,
      payload,
      { token }
    ),
  startConnectQr: (token: string) =>
    apiClient.post<StartConnectQrResponse>("/telegram/connect/start-qr", {}, { token }),
  pollLoginQr: (token: string, qrSessionId: string) =>
    apiClient.post<PollLoginQrResponse>("/telegram/connect/poll-qr", { qrSessionId }, { token }),
  verifyPasswordQr: (token: string, qrSessionId: string, password: string) =>
    apiClient.post<{ status: string; requiresPassword?: boolean }>(
      "/telegram/connect/verify-password-qr",
      { qrSessionId, password },
      { token }
    ),
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
  sync: (token: string, payload?: { dialogsLimit?: number; messagesPerDialog?: number; phone?: string; channelAccountId?: string }) =>
    apiClient.post<{ status: string }>("/telegram/sync", payload ?? {}, { token }),
  logout: (token: string) => apiClient.post<{ status: string }>("/telegram/logout", {}, { token })
};
