import { apiClient } from "./client";
import type { AccessState, AuthUser, Company } from "./types";

export type TelegramAuthCompleteResponse =
  | {
      status: "authenticated";
      user: AuthUser;
      company: Company;
      access: AccessState;
      token: string;
    }
  | {
      status: "registration_required";
      loginToken: string;
      fullName: string;
    };

export const authApi = {
  telegramStart: () => apiClient.post<{ loginToken: string; botUsername: string }>("/auth/telegram/start"),
  telegramComplete: (payload: { loginToken: string }) =>
    apiClient.post<TelegramAuthCompleteResponse>("/auth/telegram/complete", payload),
  telegramRegister: (payload: { loginToken: string; companyName: string }) =>
    apiClient.post<{ status: "authenticated"; user: AuthUser; company: Company; access: AccessState; token: string }>(
      "/auth/telegram/register",
      payload
    ),
  telegramMe: (token: string) =>
    apiClient.get<{
      telegram: null | {
        telegramUserId: string;
        username: string | null;
        firstName: string | null;
        lastName: string | null;
        photoUrl: string | null;
        linkedAt: string;
        lastAuthAt: string | null;
      };
    }>("/auth/telegram/me", { token })
};
