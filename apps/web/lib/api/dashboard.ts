import { apiClient } from "./client";
import type { DashboardOverview } from "./types";

export const dashboardApi = {
  overview: (token: string, windowDays?: number) =>
    apiClient.get<DashboardOverview>("/dashboard/overview", { token, query: { windowDays } })
};
