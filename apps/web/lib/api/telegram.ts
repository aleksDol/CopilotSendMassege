import { apiClient } from "./client";
import type { TelegramAccountResponse } from "./types";

export type StartConnectQrResponse = { qrSessionId: string; qrUrl: string; expiresAt: number };
export type PollLoginQrResponse = { status: string; expiresAt: number; errorMessage?: string | null };

export const telegramApi = {
  account: (token: string) => apiClient.get<TelegramAccountResponse>("/telegram/account", { token }),
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
  sync: (token: string) => apiClient.post<{ status: string }>("/telegram/sync", {}, { token })
};
