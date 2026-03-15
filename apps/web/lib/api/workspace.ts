import { apiClient } from "./client";
import type { WorkspaceSettings } from "./types";

export const workspaceApi = {
  getSettings: (token: string) => apiClient.get<WorkspaceSettings>("/workspace/settings", { token }),
  patchSettings: (
    token: string,
    payload: Partial<{ name: string; timezone: string; defaultReplyPolicy: Record<string, unknown> | null }>
  ) => apiClient.patch<WorkspaceSettings>("/workspace/settings", payload, { token })
};
