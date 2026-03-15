import { apiClient } from "./client";
import type { AuthUser, Company } from "./types";

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    apiClient.post<{ user: AuthUser; company: Company; token: string }>("/auth/login", payload),
  register: (payload: { fullName: string; email: string; password: string; companyName: string }) =>
    apiClient.post<{ user: AuthUser; company: Company; token: string }>("/auth/register", payload),
  me: (token: string) => apiClient.get<{ user: AuthUser; company: Company }>("/auth/me", { token })
};
