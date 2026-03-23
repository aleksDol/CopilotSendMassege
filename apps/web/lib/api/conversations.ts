import { apiClient } from "./client";
import type { ConversationListResponse, MessagesResponse, SendMessageResponse } from "./types";

export const conversationsApi = {
  list: (
    token: string,
    query: {
      limit?: number;
      cursor?: string;
      waitingForReply?: boolean;
      leadStage?: string;
    }
  ) => apiClient.get<ConversationListResponse>("/conversations", { token, query }),
  messages: (token: string, conversationId: string, query?: { before?: string; limit?: number }) =>
    apiClient.get<MessagesResponse>(`/conversations/${conversationId}/messages`, { token, query }),
  sendMessage: (token: string, conversationId: string, text: string) =>
    apiClient.post<SendMessageResponse>(`/conversations/${conversationId}/messages`, { text }, { token })
};
