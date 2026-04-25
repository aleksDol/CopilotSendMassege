import { apiClient } from "./client";
import type { DashboardOverview, DashboardSalesResponse, SalesDashboardPeriod } from "./types";

export const dashboardApi = {
  overview: (token: string, windowDays?: number) =>
    apiClient.get<DashboardOverview>("/dashboard/overview", { token, query: { windowDays } }),
  sales: (token: string, period: SalesDashboardPeriod) =>
    apiClient.get<DashboardSalesResponse>("/dashboard/sales", { token, query: { period } })
};
