import { apiClient } from "./client";
import type { AuthUser, Company } from "./types";

export const authApi = {
  login: (payload: { email: string; password: string }) =>
    apiClient.post<{ user: AuthUser; company: Company; token: string }>("/auth/login", payload),
  loginRequestCode: (payload: { email: string; password: string }) =>
    apiClient.post<{ requiresCode: true; challengeId: string }>("/auth/login/request-code", payload),
  loginVerifyCode: (payload: { email: string; challengeId: string; code: string }) =>
    apiClient.post<{ user: AuthUser; company: Company; token: string }>("/auth/login/verify-code", payload),
  resendLoginCode: (payload: { email: string; challengeId: string }) =>
    apiClient.post<{ requiresCode: true; challengeId: string }>("/auth/login/resend-code", payload),
  register: (payload: { fullName: string; email: string; password: string; companyName: string }) =>
    apiClient.post<{ user: AuthUser; company: Company; token: string }>("/auth/register", payload),
  registerRequestCode: (payload: { fullName: string; email: string; password: string; companyName: string }) =>
    apiClient.post<{ requiresCode: true; challengeId: string }>("/auth/register/request-code", payload),
  registerVerifyCode: (payload: { email: string; challengeId: string; code: string }) =>
    apiClient.post<{ user: AuthUser; company: Company; token: string }>("/auth/register/verify-code", payload),
  resendRegisterCode: (payload: { email: string; challengeId: string }) =>
    apiClient.post<{ requiresCode: true; challengeId: string }>("/auth/register/resend-code", payload),
  me: (token: string) => apiClient.get<{ user: AuthUser; company: Company }>("/auth/me", { token })
};
