"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi, billingApi, conversationsApi, dashboardApi, settingsApi, tasksApi, teamApi, telegramApi, workspaceApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";

export const useDashboardOverview = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["dashboard-overview"],
    queryFn: () => dashboardApi.overview(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useConversations = (filters: { waitingForReply?: boolean; leadStage?: string; limit?: number }) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["conversations", filters],
    queryFn: () => conversationsApi.list(token ?? "", filters),
    enabled: Boolean(token)
  });
};

export const useConversationMessages = (conversationId?: string, limit = 50) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["messages", conversationId, limit],
    queryFn: () => conversationsApi.messages(token ?? "", conversationId ?? "", { limit }),
    enabled: Boolean(token && conversationId)
  });
};

export const useTasks = (filters: Record<string, string | number | boolean | undefined>) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["tasks", filters],
    queryFn: () => tasksApi.list(token ?? "", filters),
    enabled: Boolean(token)
  });
};

export const useTelegramAccount = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["telegram-account"],
    queryFn: () => telegramApi.account(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useKnowledgeItems = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["knowledge-items"],
    queryFn: () => settingsApi.listKnowledge(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });
};

export const useReplyPolicy = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["reply-policy"],
    queryFn: () => settingsApi.getReplyPolicy(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });
};

export const useAiSuggestions = (conversationId?: string) => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["ai-suggestions", conversationId],
    queryFn: () => aiApi.listSuggestions(token ?? "", conversationId ?? ""),
    enabled: Boolean(token && conversationId)
  });
};

export const useBillingSubscription = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["billing-subscription"],
    queryFn: () => billingApi.subscription(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useBillingUsage = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["billing-usage"],
    queryFn: () => billingApi.usage(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useTeam = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["team"],
    queryFn: () => teamApi.list(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useWorkspaceSettings = () => {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["workspace-settings"],
    queryFn: () => workspaceApi.getSettings(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useSendMessageMutation = (conversationId: string) => {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => conversationsApi.sendMessage(token ?? "", conversationId, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    }
  });
};

export const useSuggestReplyMutation = (conversationId: string) => {
  const { token } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mode: "default" | "shorter" | "more_friendly" | "more_sales" | "handle_objection") =>
      aiApi.suggestReply(token ?? "", conversationId, mode),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-suggestions", conversationId] });
    }
  });
};

export const useTaskActions = () => {
  const { token } = useAuth();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tasks"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
    void qc.invalidateQueries({ queryKey: ["conversations"] });
  };

  return {
    createTask: useMutation({
      mutationFn: (payload: {
        conversationId?: string;
        title: string;
        description?: string;
        taskType: string;
        priority: string;
        dueAt?: string;
      }) => tasksApi.create(token ?? "", payload),
      onSuccess: invalidate
    }),
    patchTask: useMutation({
      mutationFn: ({ taskId, payload }: { taskId: string; payload: Record<string, unknown> }) =>
        tasksApi.patch(token ?? "", taskId, payload),
      onSuccess: invalidate
    }),
    completeTask: useMutation({
      mutationFn: (taskId: string) => tasksApi.complete(token ?? "", taskId),
      onSuccess: invalidate
    }),
    reopenTask: useMutation({
      mutationFn: (taskId: string) => tasksApi.reopen(token ?? "", taskId),
      onSuccess: invalidate
    })
  };
};

export const useTelegramActions = () => {
  const { token } = useAuth();
  const qc = useQueryClient();

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["telegram-account"] });
    void qc.invalidateQueries({ queryKey: ["dashboard-overview"] });
  };

  return {
    startConnect: useMutation({
      mutationFn: (phone: string) => telegramApi.startConnect(token ?? "", phone),
      onSuccess: refresh
    }),
    verifyCode: useMutation({
      mutationFn: ({ phone, code }: { phone: string; code: string }) => telegramApi.verifyCode(token ?? "", phone, code),
      onSuccess: refresh
    }),
    verifyPassword: useMutation({
      mutationFn: ({ phone, password }: { phone: string; password: string }) =>
        telegramApi.verifyPassword(token ?? "", phone, password),
      onSuccess: refresh
    }),
    sync: useMutation({
      mutationFn: () => telegramApi.sync(token ?? ""),
      onSuccess: refresh
    })
  };
};

export const useBillingActions = () => {
  const { token } = useAuth();
  const qc = useQueryClient();

  return {
    checkout: useMutation({
      mutationFn: async (plan: "pro" | "team") => {
        const session = await billingApi.createCheckoutSession(token ?? "", plan);
        if (session.url) {
          window.location.href = session.url;
        }
        return session;
      }
    }),
    portal: useMutation({
      mutationFn: async () => {
        const session = await billingApi.createPortalSession(token ?? "");
        if (session.url) {
          window.location.href = session.url;
        }
        return session;
      }
    }),
    refresh: () => {
      void qc.invalidateQueries({ queryKey: ["billing-subscription"] });
      void qc.invalidateQueries({ queryKey: ["billing-usage"] });
    }
  };
};

export const useTeamActions = () => {
  const { token } = useAuth();
  const qc = useQueryClient();

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["team"] });
    void qc.invalidateQueries({ queryKey: ["billing-subscription"] });
  };

  return {
    invite: useMutation({
      mutationFn: (payload: { email: string; role: "member" | "admin" }) => teamApi.invite(token ?? "", payload),
      onSuccess: invalidate
    }),
    remove: useMutation({
      mutationFn: (memberId: string) => teamApi.removeMember(token ?? "", memberId),
      onSuccess: invalidate
    })
  };
};

export const useSettingsActions = () => {
  const { token } = useAuth();
  const qc = useQueryClient();

  return {
    createKnowledge: useMutation({
      mutationFn: (payload: { kind: string; title: string; content: string; priority: number; isActive: boolean }) =>
        settingsApi.createKnowledge(token ?? "", payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["knowledge-items"] })
    }),
    updateKnowledge: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Partial<{ kind: string; title: string; content: string; priority: number; isActive: boolean }> }) =>
        settingsApi.updateKnowledge(token ?? "", id, payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["knowledge-items"] })
    }),
    saveReplyPolicy: useMutation({
      mutationFn: (payload: {
        toneRules?: unknown;
        pricingRules?: unknown;
        discountRules?: unknown;
        forbiddenPromises?: unknown;
        forbiddenTopics?: unknown;
        humanHandoffRules?: unknown;
      }) => settingsApi.saveReplyPolicy(token ?? "", payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["reply-policy"] })
    }),
    patchWorkspaceSettings: useMutation({
      mutationFn: (payload: Partial<{ name: string; timezone: string; defaultReplyPolicy: Record<string, unknown> | null }>) =>
        workspaceApi.patchSettings(token ?? "", payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["workspace-settings"] })
    })
  };
};
