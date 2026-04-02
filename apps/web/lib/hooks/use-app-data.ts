"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { aiApi, billingApi, conversationsApi, dashboardApi, leadradarApi, settingsApi, tasksApi, teamApi, telegramApi, workspaceApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";

/** Scope key so cache is never shared between users/companies (accounts). */
const baseScopeKey = (companyId: string | undefined, userId: string | undefined) =>
  `${companyId ?? ""}:${userId ?? ""}`;

export const useDashboardOverview = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["dashboard-overview", baseScopeKey(company?.id, user?.id)],
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
  const telegram = useTelegramAccount();
  const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
  const channelAccountId = telegram.data?.channelAccountId ?? "";
  const isTelegramConnected = telegramStatus === "connected" && Boolean(channelAccountId);
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  const { refetchInterval, ...queryFilters } = filters;
  return useQuery({
    queryKey: ["conversations", scope, queryFilters],
    queryFn: () => conversationsApi.list(token ?? "", queryFilters),
    enabled: Boolean(token && isTelegramConnected),
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
  const telegram = useTelegramAccount();
  const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
  const channelAccountId = telegram.data?.channelAccountId ?? "";
  const isTelegramConnected = telegramStatus === "connected" && Boolean(channelAccountId);
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  return useQuery({
    queryKey: ["messages", scope, conversationId, limit],
    queryFn: () => conversationsApi.messages(token ?? "", conversationId ?? "", { limit }),
    enabled: Boolean(token && conversationId && isTelegramConnected),
    refetchInterval: refetchInterval ?? false,
    refetchIntervalInBackground: true
  });
};

export const useTasks = (filters: Record<string, string | number | boolean | undefined>) => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["tasks", baseScopeKey(company?.id, user?.id), filters],
    queryFn: () => tasksApi.list(token ?? "", filters),
    enabled: Boolean(token)
  });
};

export const useTelegramAccount = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["telegram-account", baseScopeKey(company?.id, user?.id)],
    queryFn: () => telegramApi.account(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useKnowledgeItems = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["knowledge-items", baseScopeKey(company?.id, user?.id)],
    queryFn: () => settingsApi.listKnowledge(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });
};

export const useReplyPolicy = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["reply-policy", baseScopeKey(company?.id, user?.id)],
    queryFn: () => settingsApi.getReplyPolicy(token ?? ""),
    enabled: Boolean(token),
    retry: false
  });
};

export const useAiSuggestions = (conversationId?: string) => {
  const { token, company, user } = useAuth();
  const telegram = useTelegramAccount();
  const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
  const channelAccountId = telegram.data?.channelAccountId ?? "";
  const isTelegramConnected = telegramStatus === "connected" && Boolean(channelAccountId);
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  return useQuery({
    queryKey: ["ai-suggestions", scope, conversationId],
    queryFn: () => aiApi.listSuggestions(token ?? "", conversationId ?? ""),
    enabled: Boolean(token && conversationId && isTelegramConnected)
  });
};

export const useBillingSubscription = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["billing-subscription", baseScopeKey(company?.id, user?.id)],
    queryFn: () => billingApi.subscription(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useBillingUsage = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["billing-usage", baseScopeKey(company?.id, user?.id)],
    queryFn: () => billingApi.usage(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useTeam = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["team", baseScopeKey(company?.id, user?.id)],
    queryFn: () => teamApi.list(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useWorkspaceSettings = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["workspace-settings", baseScopeKey(company?.id, user?.id)],
    queryFn: () => workspaceApi.getSettings(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useLeadRadarLeads = (params: {
  status?: import("@/lib/api/types").LeadRadarLeadStatus | "all";
  search?: string;
  page: number;
  limit: number;
  sortBy?: "created_at" | "message_date" | "score";
  sortOrder?: "asc" | "desc";
}) => {
  const { token, company, user } = useAuth();
  const scope = baseScopeKey(company?.id, user?.id);
  return useQuery({
    queryKey: ["leadradar-leads", scope, params],
    queryFn: () => leadradarApi.listLeads(token ?? "", params),
    enabled: Boolean(token)
  });
};

export const useLeadRadarLead = (leadId: string | null) => {
  const { token, company, user } = useAuth();
  const scope = baseScopeKey(company?.id, user?.id);
  return useQuery({
    queryKey: ["leadradar-lead", scope, leadId],
    queryFn: () => leadradarApi.getLead(token ?? "", leadId ?? ""),
    enabled: Boolean(token && leadId)
  });
};

export const useLeadRadarActions = () => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = baseScopeKey(company?.id, user?.id);

  const invalidateList = () => void qc.invalidateQueries({ queryKey: ["leadradar-leads", scope] });
  const invalidateLead = (leadId: string) => void qc.invalidateQueries({ queryKey: ["leadradar-lead", scope, leadId] });

  return {
    updateLeadStatus: useMutation({
      mutationFn: (input: { leadId: string; status: import("@/lib/api/types").LeadRadarLeadStatus }) =>
        leadradarApi.updateLeadStatus(token ?? "", input.leadId, input.status),
      onSuccess: (_data, vars) => {
        invalidateList();
        invalidateLead(vars.leadId);
      }
    }),
    updateLeadNotes: useMutation({
      mutationFn: (input: { leadId: string; notes: string | null }) =>
        leadradarApi.updateLeadNotes(token ?? "", input.leadId, input.notes),
      onSuccess: (_data, vars) => {
        invalidateList();
        invalidateLead(vars.leadId);
      }
    })
  };
};

export const useLeadRadarSources = () => {
  const { token, company, user } = useAuth();
  const scope = baseScopeKey(company?.id, user?.id);
  return useQuery({
    queryKey: ["leadradar-sources", scope],
    queryFn: () => leadradarApi.listSources(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useLeadRadarKeywords = (params?: { is_active?: boolean; category?: string }) => {
  const { token, company, user } = useAuth();
  const scope = baseScopeKey(company?.id, user?.id);
  return useQuery({
    queryKey: ["leadradar-keywords", scope, params ?? {}],
    queryFn: () => leadradarApi.listKeywords(token ?? "", params),
    enabled: Boolean(token)
  });
};

export const useLeadRadarNegativeKeywords = () => {
  const { token, company, user } = useAuth();
  const scope = baseScopeKey(company?.id, user?.id);
  return useQuery({
    queryKey: ["leadradar-negative-keywords", scope],
    queryFn: () => leadradarApi.listNegativeKeywords(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useLeadRadarSettings = () => {
  const { token, company, user } = useAuth();
  const scope = baseScopeKey(company?.id, user?.id);
  return useQuery({
    queryKey: ["leadradar-settings", scope],
    queryFn: () => leadradarApi.getSettings(token ?? ""),
    enabled: Boolean(token)
  });
};

export const useLeadRadarConfigActions = () => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = baseScopeKey(company?.id, user?.id);
  const invalidate = (key: string) => void qc.invalidateQueries({ queryKey: [key, scope] });

  return {
    addSource: useMutation({
      mutationFn: (input: { telegramChatId: string; chatTitle?: string | null; chatType?: string | null }) =>
        leadradarApi.addSource(token ?? "", input),
      onSuccess: () => invalidate("leadradar-sources")
    }),
    updateSource: useMutation({
      mutationFn: (input: { id: string; isActive: boolean }) => leadradarApi.updateSource(token ?? "", input.id, { isActive: input.isActive }),
      onSuccess: () => invalidate("leadradar-sources")
    }),
    removeSource: useMutation({
      mutationFn: (id: string) => leadradarApi.removeSource(token ?? "", id),
      onSuccess: () => invalidate("leadradar-sources")
    }),

    addKeyword: useMutation({
      mutationFn: (input: { keyword: string; matchType: string; category: string; priority?: number }) =>
        leadradarApi.addKeyword(token ?? "", input),
      onSuccess: () => invalidate("leadradar-keywords")
    }),
    updateKeyword: useMutation({
      mutationFn: (input: {
        id: string;
        patch: Partial<{ keyword: string; matchType: string; category: string; priority: number; isActive: boolean }>;
      }) => leadradarApi.updateKeyword(token ?? "", input.id, input.patch),
      onSuccess: () => invalidate("leadradar-keywords")
    }),
    removeKeyword: useMutation({
      mutationFn: (id: string) => leadradarApi.removeKeyword(token ?? "", id),
      onSuccess: () => invalidate("leadradar-keywords")
    }),

    addNegativeKeyword: useMutation({
      mutationFn: (input: { phrase: string }) => leadradarApi.addNegativeKeyword(token ?? "", input),
      onSuccess: () => invalidate("leadradar-negative-keywords")
    }),
    updateNegativeKeyword: useMutation({
      mutationFn: (input: { id: string; patch: Partial<{ phrase: string; isActive: boolean }> }) =>
        leadradarApi.updateNegativeKeyword(token ?? "", input.id, input.patch),
      onSuccess: () => invalidate("leadradar-negative-keywords")
    }),
    removeNegativeKeyword: useMutation({
      mutationFn: (id: string) => leadradarApi.removeNegativeKeyword(token ?? "", id),
      onSuccess: () => invalidate("leadradar-negative-keywords")
    }),

    updateSettings: useMutation({
      mutationFn: (patch: Partial<import("@/lib/api/types").LeadRadarSettingsResponse>) =>
        leadradarApi.updateSettings(token ?? "", patch),
      onSuccess: () => invalidate("leadradar-settings")
    })
  };
};

export const useSendMessageMutation = (conversationId: string) => {
  const { token, company, user } = useAuth();
  const telegram = useTelegramAccount();
  const channelAccountId = telegram.data?.channelAccountId ?? "";
  const qc = useQueryClient();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  return useMutation({
    mutationFn: (text: string) => conversationsApi.sendMessage(token ?? "", conversationId, text),
    onSuccess: () => {
      // Scope can be stale briefly during Telegram account switching.
      // Invalidate by conversationId to guarantee correct dialog refresh.
      void qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "messages" && q.queryKey[2] === conversationId
      });
      void qc.invalidateQueries({ queryKey: ["conversations", scope] });
      void qc.invalidateQueries({ queryKey: ["dashboard-overview", baseScopeKey(company?.id, user?.id)] });
    }
  });
};

export const useSuggestReplyMutation = (conversationId: string) => {
  const { token, company, user } = useAuth();
  const telegram = useTelegramAccount();
  const channelAccountId = telegram.data?.channelAccountId ?? "";
  const qc = useQueryClient();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  return useMutation({
    mutationFn: (mode: "default" | "shorter" | "more_friendly" | "more_sales" | "handle_objection") =>
      aiApi.suggestReply(token ?? "", conversationId, mode),
    onSuccess: () => {
      void qc.invalidateQueries({
        predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "ai-suggestions" && q.queryKey[2] === conversationId
      });
    }
  });
};

export const useTaskActions = () => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = baseScopeKey(company?.id, user?.id);

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
  const scope = baseScopeKey(company?.id, user?.id);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["telegram-account", scope] });
    void qc.invalidateQueries({ queryKey: ["dashboard-overview", scope] });
    void qc.invalidateQueries({ queryKey: ["conversations", scope] });
    void qc.invalidateQueries({ queryKey: ["tasks", scope] });
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
      onSuccess: () => {
        // Telegram disconnect should immediately hide chats and stop showing stale cached conversations/messages.
        refresh();
        qc.removeQueries({ queryKey: ["conversations"] });
        qc.removeQueries({ queryKey: ["messages"] });
        qc.removeQueries({ queryKey: ["ai-suggestions"] });
      }
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
      const scope = baseScopeKey(company?.id, user?.id);
      void qc.invalidateQueries({ queryKey: ["billing-subscription", scope] });
      void qc.invalidateQueries({ queryKey: ["billing-usage", scope] });
    }
  };
};

export const useTeamActions = () => {
  const { token, company, user } = useAuth();
  const qc = useQueryClient();
  const scope = baseScopeKey(company?.id, user?.id);

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
  const scope = baseScopeKey(company?.id, user?.id);

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
