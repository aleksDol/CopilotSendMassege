import { apiClient } from "./client";

export type SystemLogLevel = "info" | "warn" | "error";

export type SystemLogRow = {
  id: string;
  createdAt: string;
  level: SystemLogLevel;
  module: string;
  event: string;
  traceId: string | null;
  userId: string | null;
  companyId: string | null;
  metadata: unknown;
};

export type SystemLogFilters = {
  level?: SystemLogLevel;
  module?: string;
  traceId?: string;
  limit?: number;
};

export const systemLogsApi = {
  list: (token: string, filters: SystemLogFilters) =>
    apiClient.get<{ logs: SystemLogRow[] }>("/admin/system-logs", {
      token,
      query: {
        level: filters.level,
        module: filters.module,
        traceId: filters.traceId,
        limit: filters.limit
      }
    })
};
