import { apiClient } from "./client";
import type { TaskItem, TaskListResponse } from "./types";

export const tasksApi = {
  list: (
    token: string,
    query: {
      status?: string;
      taskType?: string;
      priority?: string;
      assignedUserId?: string;
      conversationId?: string;
      dueBefore?: string;
      dueAfter?: string;
      limit?: number;
      cursor?: string;
    }
  ) => apiClient.get<TaskListResponse>("/tasks", { token, query }),
  byConversation: (token: string, conversationId: string, limit = 20) =>
    apiClient.get<{ items: TaskItem[] }>(`/conversations/${conversationId}/tasks`, { token, query: { limit } }),
  create: (
    token: string,
    payload: {
      conversationId?: string;
      title: string;
      description?: string;
      taskType: string;
      priority: string;
      dueAt?: string;
      assignedUserId?: string;
    }
  ) => apiClient.post<{ item: TaskItem }>("/tasks", payload, { token }),
  patch: (token: string, taskId: string, payload: Record<string, unknown>) =>
    apiClient.patch<{ item: TaskItem }>(`/tasks/${taskId}`, payload, { token }),
  complete: (token: string, taskId: string) => apiClient.post<{ item: TaskItem }>(`/tasks/${taskId}/complete`, {}, { token }),
  reopen: (token: string, taskId: string) => apiClient.post<{ item: TaskItem }>(`/tasks/${taskId}/reopen`, {}, { token })
};
