import { apiClient } from "./client";
import type { AiSuggestion } from "./types";

export const aiApi = {
  suggestReply: (
    token: string,
    conversationId: string,
    mode: "default" | "shorter" | "more_friendly" | "more_sales" | "handle_objection"
  ) =>
    apiClient.post<{
      suggestion: AiSuggestion;
      context: {
        leadStage: string | null;
        leadTemperature: string | null;
        lastClientIntent: string | null;
      };
      reused: boolean;
    }>(`/conversations/${conversationId}/ai/suggest-reply`, { mode }, { token }),
  listSuggestions: (token: string, conversationId: string, limit = 10) =>
    apiClient.get<{ items: AiSuggestion[] }>(`/conversations/${conversationId}/ai/suggestions`, { token, query: { limit } }),
  accept: (token: string, suggestionId: string) =>
    apiClient.post<{ suggestion: AiSuggestion }>(`/ai/suggestions/${suggestionId}/accept`, {}, { token }),
  reject: (token: string, suggestionId: string) =>
    apiClient.post<{ suggestion: AiSuggestion }>(`/ai/suggestions/${suggestionId}/reject`, {}, { token })
};
