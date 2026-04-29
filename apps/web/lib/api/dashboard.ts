import { apiClient } from "./client";
import type { DashboardOverview, DashboardSalesResponse, SalesDashboardPeriod } from "./types";

export const dashboardApi = {
  overview: (token: string, windowDays?: number, channelAccountId?: string) =>
    apiClient.get<DashboardOverview>("/dashboard/overview", { token, query: { windowDays, channelAccountId } }),
  sales: (token: string, period: SalesDashboardPeriod, channelAccountId?: string) =>
    apiClient.get<DashboardSalesResponse>("/dashboard/sales", { token, query: { period, channelAccountId } })
};
