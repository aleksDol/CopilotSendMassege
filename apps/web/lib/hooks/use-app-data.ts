"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi, billingApi, conversationsApi, dashboardApi, settingsApi, tasksApi, teamApi, telegramApi, workspaceApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";

/** Scope key so cache is never shared between users/companies (accounts). */
const scopeKey = (companyId: string | undefined, userId: string | undefined) =>
  `${companyId ?? ""}:${userId ?? ""}`;

export const useDashboardOverview = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["dashboard-overview", scopeKey(company?.id, user?.id)],
    queryFn: () => dashboardApi.overview(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useConversations = (filters: {
  waitingForReply?: boolean;
  leadStage?: string;
  limit?: number;
  refetchInterval?: number;
}) => {
  const { token, company, user } = useAuth();
  const { refetchInterval, ...queryFilters } = filters;
  return useQuery({
    queryKey: ["conversations", scopeKey(company?.id, user?.id), queryFilters],
    queryFn: () => conversationsApi.list(token ?? "", queryFilters),
    enabled: Boolean(token),
    refetchInterval: refetchInterval ?? false,
    refetchIntervalInBackground: true
  });
};

export const useConversationMessages = (
  conversationId?: string,
  limit = 50,
  refetchInterval?: number
) => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["messages", scopeKey(company?.id, user?.id), conversationId, limit],
    queryFn: () => conversationsApi.messages(token ?? "", conversationId ?? "", { limit }),
    enabled: Boolean(token && conversationId),
    refetchInterval: refetchInterval ?? false,
    refetchIntervalInBackground: true
  });
};

export const useTasks = (filters: Record<string, string | number | boolean | undefined>) => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["tasks", scopeKey(company?.id, user?.id), filters],
    queryFn: () => tasksApi.list(token ?? "", filters),
    enabled: Boolean(token)
  });
};

export const useTelegramAccount = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["telegram-account", scopeKey(company?.id, user?.id)],
    queryFn: () => telegramApi.account(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useKnowledgeItems = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["knowledge-items", scopeKey(company?.id, user?.id)],
    queryFn: () => settingsApi.listKnowledge(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });
};

export const useReplyPolicy = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["reply-policy", scopeKey(company?.id, user?.id)],
    queryFn: () => settingsApi.getReplyPolicy(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });
};

export const useAiSuggestions = (conversationId?: string) => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["ai-suggestions", scopeKey(company?.id, user?.id), conversationId],
    queryFn: () => aiApi.listSuggestions(token ?? "", conversationId ?? ""),
    enabled: Boolean(token && conversationId)
  });
};

export const useBillingSubscription = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["billing-subscription", scopeKey(company?.id, user?.id)],
    queryFn: () => billingApi.subscription(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useBillingUsage = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["billing-usage", scopeKey(company?.id, user?.id)],
    queryFn: () => billingApi.usage(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useTeam = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["team", scopeKey(company?.id, user?.id)],
    queryFn: () => teamApi.list(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useWorkspaceSettings = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["workspace-settings", scopeKey(company?.id, user?.id)],
    queryFn: () => workspaceApi.getSettings(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useSendMessageMutation = (conversationId: string) => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = scopeKey(company?.id, user?.id);
  return useMutation({
    mutationFn: (text: string) => conversationsApi.sendMessage(token ?? "", conversationId, text),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["messages", scope, conversationId] });
      void qc.invalidateQueries({ queryKey: ["conversations", scope] });
      void qc.invalidateQueries({ queryKey: ["dashboard-overview", scope] });
    }
  });
};

export const useSuggestReplyMutation = (conversationId: string) => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = scopeKey(company?.id, user?.id);
  return useMutation({
    mutationFn: (mode: "default" | "shorter" | "more_friendly" | "more_sales" | "handle_objection") =>
      aiApi.suggestReply(token ?? "", conversationId, mode),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["ai-suggestions", scope, conversationId] });
    }
  });
};

export const useTaskActions = () => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = scopeKey(company?.id, user?.id);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["tasks", scope] });
    void qc.invalidateQueries({ queryKey: ["dashboard-overview", scope] });
    void qc.invalidateQueries({ queryKey: ["conversations", scope] });
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
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = scopeKey(company?.id, user?.id);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["telegram-account", scope] });
    void qc.invalidateQueries({ queryKey: ["dashboard-overview", scope] });
  };

  return {
    startConnectQr: useMutation({
      mutationFn: () => telegramApi.startConnectQr(token ?? ""),
      onSuccess: refresh
    }),
    pollLoginQr: useMutation({
      mutationFn: (qrSessionId: string) => telegramApi.pollLoginQr(token ?? "", qrSessionId),
      onSuccess: (data) => {
        if (data?.status === "connected") refresh();
      }
    }),
    verifyPasswordQr: useMutation({
      mutationFn: ({ qrSessionId, password }: { qrSessionId: string; password: string }) =>
        telegramApi.verifyPasswordQr(token ?? "", qrSessionId, password),
      onSuccess: refresh
    }),
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
    }),
    logout: useMutation({
      mutationFn: () => telegramApi.logout(token ?? ""),
      onSuccess: refresh
    })
  };
};

export const useBillingActions = () => {
  const { token, company, user } = useAuth();
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
      const scope = scopeKey(company?.id, user?.id);
      void qc.invalidateQueries({ queryKey: ["billing-subscription", scope] });
      void qc.invalidateQueries({ queryKey: ["billing-usage", scope] });
    }
  };
};

export const useTeamActions = () => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = scopeKey(company?.id, user?.id);

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["team", scope] });
    void qc.invalidateQueries({ queryKey: ["billing-subscription", scope] });
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
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = scopeKey(company?.id, user?.id);

  return {
    createKnowledge: useMutation({
      mutationFn: (payload: { kind: string; title: string; content: string; priority: number; isActive: boolean }) =>
        settingsApi.createKnowledge(token ?? "", payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["knowledge-items", scope] })
    }),
    updateKnowledge: useMutation({
      mutationFn: ({ id, payload }: { id: string; payload: Partial<{ kind: string; title: string; content: string; priority: number; isActive: boolean }> }) =>
        settingsApi.updateKnowledge(token ?? "", id, payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["knowledge-items", scope] })
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
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["reply-policy", scope] })
    }),
    patchWorkspaceSettings: useMutation({
      mutationFn: (payload: Partial<{ name: string; timezone: string; defaultReplyPolicy: Record<string, unknown> | null }>) =>
        workspaceApi.patchSettings(token ?? "", payload),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["workspace-settings", scope] })
    })
  };
};
