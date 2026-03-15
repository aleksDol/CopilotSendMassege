import { apiClient } from "./client";
import type { BillingSubscription, BillingUsage } from "./types";

export const billingApi = {
  subscription: (token: string) => apiClient.get<BillingSubscription>("/billing/subscription", { token }),
  usage: (token: string) => apiClient.get<BillingUsage>("/billing/usage", { token }),
  createCheckoutSession: (token: string, plan: "pro" | "team") =>
    apiClient.post<{ url: string }>("/billing/checkout-session", { plan }, { token }),
  createPortalSession: (token: string) => apiClient.post<{ url: string }>("/billing/portal", {}, { token })
};
