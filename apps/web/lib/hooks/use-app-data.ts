"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { aiApi, billingApi, conversationsApi, crmApi, dashboardApi, leadradarApi, settingsApi, tasksApi, teamApi, telegramApi, workspaceApi } from "@/lib/api";
import { useAuth } from "@/lib/auth/context";
import type { TelegramAccountResponse } from "@/lib/api/types";
import { isLeadRadarParsingSelectionError, isTelegramAccountSelectionError } from "@/lib/api/errors";

/** Scope key so cache is never shared between users/companies (accounts). */
const baseScopeKey = (companyId: string | undefined, userId: string | undefined) =>
  `${companyId ?? ""}:${userId ?? ""}`;

const selectedTelegramStorageKey = (companyId?: string) =>
  companyId ? `selectedTelegramChannelAccountId:${companyId}` : null;
const selectedLeadRadarParsingStorageKey = (companyId?: string) =>
  companyId ? `selectedLeadRadarParsingChannelAccountId:${companyId}` : null;

let lastAccountRecoveryAlertAt = 0;
const showAccountRecoveryAlert = (message: string) => {
  if (typeof window === "undefined") return;
  const now = Date.now();
  if (now - lastAccountRecoveryAlertAt < 2000) return;
  lastAccountRecoveryAlertAt = now;
  window.alert(message);
};

export const useSelectedTelegramChannelAccountId = () => {
  const { company, user } = useAuth();
  const telegram = useTelegramAccount();
  const telegramAccounts = useTelegramAccounts();
  const key = selectedTelegramStorageKey(company?.id);
  const availableAccountIds = (telegramAccounts.data?.items ?? [])
    .map((account) => (account.channelAccountId ?? "").trim())
    .filter(Boolean);
  const fallbackFromAccount = (telegram.data?.channelAccountId ?? "").trim();
  const fallback = availableAccountIds.includes(fallbackFromAccount)
    ? fallbackFromAccount
    : availableAccountIds[0] ?? "";
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    const fromStorage = window.localStorage.getItem(key)?.trim() ?? "";
    if (fromStorage && availableAccountIds.includes(fromStorage)) {
      setSelected(fromStorage);
      return;
    }
    if (fromStorage && !availableAccountIds.includes(fromStorage)) {
      window.localStorage.removeItem(key);
    }
    if (fallback) {
      setSelected(fallback);
      return;
    }
    setSelected("");
  }, [key, fallback, availableAccountIds]);

  const setSelectedChannelAccountId = (value: string | null) => {
    const next = (value ?? "").trim();
    setSelected(next);
    if (!key || typeof window === "undefined") return;
    if (next) window.localStorage.setItem(key, next);
    else window.localStorage.removeItem(key);
  };

  return {
    selectedChannelAccountId: selected || fallback || "",
    setSelectedChannelAccountId
  };
};

export const useSelectedLeadRadarParsingChannelAccountId = () => {
  const { company, user } = useAuth();
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const telegramAccounts = useTelegramAccounts();
  const key = selectedLeadRadarParsingStorageKey(company?.id);
  const [selected, setSelected] = useState<string>("");

  const parsingAccounts = (telegramAccounts.data?.items ?? []).filter((account: TelegramAccountResponse) => {
    const channelAccountId = (account.channelAccountId ?? "").trim();
    if (!channelAccountId) return false;
    const status = String(account.status ?? "").toUpperCase();
    return account.parsingEnabled && status !== "DISCONNECTED";
  });
  const fallback = (() => {
    const selectedChatsAccount = parsingAccounts.find((account: TelegramAccountResponse) => account.channelAccountId === selectedChannelAccountId);
    if (selectedChatsAccount?.channelAccountId) return selectedChatsAccount.channelAccountId;
    return parsingAccounts[0]?.channelAccountId ?? "";
  })();

  useEffect(() => {
    if (!key || typeof window === "undefined") return;
    const fromStorage = window.localStorage.getItem(key)?.trim() ?? "";
    if (fromStorage && parsingAccounts.some((account: TelegramAccountResponse) => account.channelAccountId === fromStorage)) {
      setSelected(fromStorage);
      return;
    }
    if (fromStorage && !parsingAccounts.some((account: TelegramAccountResponse) => account.channelAccountId === fromStorage)) {
      window.localStorage.removeItem(key);
    }
    setSelected(fallback);
  }, [key, fallback, parsingAccounts]);

  const setSelectedLeadRadarParsingChannelAccountId = (value: string | null) => {
    const next = (value ?? "").trim();
    setSelected(next);
    if (!key || typeof window === "undefined") return;
    if (next) window.localStorage.setItem(key, next);
    else window.localStorage.removeItem(key);
  };

  return {
    selectedLeadRadarParsingChannelAccountId: selected || fallback || "",
    setSelectedLeadRadarParsingChannelAccountId,
    parsingAccounts
  };
};

export const useDashboardOverview = () => {
  const { token, company, user } = useAuth();
  const { selectedChannelAccountId, setSelectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  return useQuery({
    queryKey: ["dashboard-overview", baseScopeKey(company?.id, user?.id), selectedChannelAccountId],
    queryFn: async () => {
      try {
        return await dashboardApi.overview(token ?? "", undefined, selectedChannelAccountId || undefined);
      } catch (error) {
        if (selectedChannelAccountId && isTelegramAccountSelectionError(error)) {
          setSelectedChannelAccountId(null);
          showAccountRecoveryAlert("Выбранный Telegram-аккаунт недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token)
  });
};

export const useDashboardSales = (period: import("@/lib/api/types").SalesDashboardPeriod) => {
  const { token, company, user } = useAuth();
  const { selectedChannelAccountId, setSelectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  return useQuery({
    queryKey: ["dashboard-sales", baseScopeKey(company?.id, user?.id), selectedChannelAccountId, period],
    queryFn: async () => {
      try {
        return await dashboardApi.sales(token ?? "", period, selectedChannelAccountId || undefined);
      } catch (error) {
        if (selectedChannelAccountId && isTelegramAccountSelectionError(error)) {
          setSelectedChannelAccountId(null);
          showAccountRecoveryAlert("Выбранный Telegram-аккаунт недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
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
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const { setSelectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
  const channelAccountId = selectedChannelAccountId;
  const isTelegramConnected = telegramStatus === "connected" && Boolean(channelAccountId);
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  const { refetchInterval, ...queryFilters } = filters;
  return useQuery({
    queryKey: ["conversations", scope, queryFilters],
    queryFn: async () => {
      try {
        return await conversationsApi.list(token ?? "", { ...queryFilters, channelAccountId });
      } catch (error) {
        if (channelAccountId && isTelegramAccountSelectionError(error)) {
          setSelectedChannelAccountId(null);
          showAccountRecoveryAlert("Выбранный Telegram-аккаунт недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
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
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const { setSelectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
  const channelAccountId = selectedChannelAccountId;
  const isTelegramConnected = telegramStatus === "connected" && Boolean(channelAccountId);
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  return useQuery({
    queryKey: ["messages", scope, conversationId, limit],
    queryFn: async () => {
      try {
        return await conversationsApi.messages(token ?? "", conversationId ?? "", { limit, channelAccountId });
      } catch (error) {
        if (channelAccountId && isTelegramAccountSelectionError(error)) {
          setSelectedChannelAccountId(null);
          showAccountRecoveryAlert("Выбранный Telegram-аккаунт недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
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

export const useCrmLeads = (filters: {
  stage?: string;
  search?: string;
  limit?: number;
  cursor?: string;
  crmAccountFilter?: "all" | string;
}) => {
  const { token, company, user } = useAuth();
  const crmAccountFilter = filters.crmAccountFilter ?? "all";
  const scope = `${baseScopeKey(company?.id, user?.id)}:${crmAccountFilter}`;
  const { crmAccountFilter: _unused, ...queryFilters } = filters;
  return useQuery({
    queryKey: ["crm-leads", scope, filters],
    queryFn: () =>
      crmApi.listLeads(token ?? "", {
        ...queryFilters,
        channelAccountId: crmAccountFilter === "all" ? undefined : crmAccountFilter
      }),
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

export const useTelegramAccounts = () => {
  const { token, company, user } = useAuth();
  return useQuery({
    queryKey: ["telegram-accounts", baseScopeKey(company?.id, user?.id)],
    queryFn: () => telegramApi.accounts(token ?? ""),
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
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const telegramStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "login_required";
  const channelAccountId = selectedChannelAccountId;
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
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  return useQuery({
    queryKey: ["leadradar-leads", scope, params],
    queryFn: async () => {
      try {
        return await leadradarApi.listLeads(token ?? "", { ...params, channelAccountId: selectedLeadRadarParsingChannelAccountId || undefined });
      } catch (error) {
        if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
          setSelectedLeadRadarParsingChannelAccountId(null);
          showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token)
  });
};

export const useLeadRadarLead = (leadId: string | null) => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  return useQuery({
    queryKey: ["leadradar-lead", scope, leadId],
    queryFn: async () => {
      try {
        return await leadradarApi.getLead(token ?? "", leadId ?? "", selectedLeadRadarParsingChannelAccountId || undefined);
      } catch (error) {
        if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
          setSelectedLeadRadarParsingChannelAccountId(null);
          showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token && leadId)
  });
};

export const useLeadRadarActions = () => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const qc = useQueryClient();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;

  const handleParsingError = (error: unknown) => {
    if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
      setSelectedLeadRadarParsingChannelAccountId(null);
      showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
    }
  };
  const invalidateList = () => void qc.invalidateQueries({ queryKey: ["leadradar-leads", scope] });
  const invalidateLead = (leadId: string) => void qc.invalidateQueries({ queryKey: ["leadradar-lead", scope, leadId] });

  return {
    generateFirstMessage: useMutation({
      mutationFn: async (leadId: string) => {
        try {
          return await leadradarApi.generateFirstMessage(token ?? "", leadId, selectedLeadRadarParsingChannelAccountId || undefined);
        } catch (error) {
          handleParsingError(error);
          throw error;
        }
      },
      onSuccess: (_data, leadId) => {
        // Does not change lead status, but refresh lead details is cheap and keeps UI consistent.
        invalidateLead(leadId);
      }
    }),
    sendFirstMessage: useMutation({
      mutationFn: async (input: { leadId: string; text: string; channelAccountId?: string }) => {
        try {
          return await leadradarApi.sendFirstMessage(
          token ?? "",
          input.leadId,
          input.text,
          input.channelAccountId,
          selectedLeadRadarParsingChannelAccountId || undefined
          );
        } catch (error) {
          handleParsingError(error);
          throw error;
        }
      },
      onSuccess: (_data, vars) => {
        // Backend updates status only after successful send.
        invalidateList();
        invalidateLead(vars.leadId);
        void qc.invalidateQueries({ queryKey: ["conversations"] });
      }
    }),
    updateLeadStatus: useMutation({
      mutationFn: async (input: { leadId: string; status: import("@/lib/api/types").LeadRadarLeadStatus }) => {
        try {
          return await leadradarApi.updateLeadStatus(token ?? "", input.leadId, input.status, selectedLeadRadarParsingChannelAccountId || undefined);
        } catch (error) {
          handleParsingError(error);
          throw error;
        }
      },
      onSuccess: (_data, vars) => {
        invalidateList();
        invalidateLead(vars.leadId);
      }
    }),
    updateLeadNotes: useMutation({
      mutationFn: async (input: { leadId: string; notes: string | null }) => {
        try {
          return await leadradarApi.updateLeadNotes(token ?? "", input.leadId, input.notes, selectedLeadRadarParsingChannelAccountId || undefined);
        } catch (error) {
          handleParsingError(error);
          throw error;
        }
      },
      onSuccess: (_data, vars) => {
        invalidateList();
        invalidateLead(vars.leadId);
      }
    }),
    removeLead: useMutation({
      mutationFn: async (leadId: string) => {
        try {
          return await leadradarApi.removeLead(token ?? "", leadId, selectedLeadRadarParsingChannelAccountId || undefined);
        } catch (error) {
          handleParsingError(error);
          throw error;
        }
      },
      onSuccess: (_data, leadId) => {
        invalidateList();
        void qc.invalidateQueries({ queryKey: ["leadradar-lead", scope, leadId] });
      }
    }),
    createManualLead: useMutation({
      mutationFn: async (input: { name?: string | null; username: string; comment: string }) => {
        try {
          return await leadradarApi.createManualLead(token ?? "", input, selectedLeadRadarParsingChannelAccountId || undefined);
        } catch (error) {
          handleParsingError(error);
          throw error;
        }
      },
      onSuccess: () => {
        invalidateList();
      }
    })
  };
};

export const useLeadRadarSources = () => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  return useQuery({
    queryKey: ["leadradar-sources", scope],
    queryFn: async () => {
      try {
        return await leadradarApi.listSources(token ?? "", selectedLeadRadarParsingChannelAccountId || undefined);
      } catch (error) {
        if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
          setSelectedLeadRadarParsingChannelAccountId(null);
          showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token)
  });
};

export const useLeadRadarKeywords = (params?: { is_active?: boolean; category?: string }) => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  return useQuery({
    queryKey: ["leadradar-keywords", scope, params ?? {}],
    queryFn: async () => {
      try {
        return await leadradarApi.listKeywords(token ?? "", { ...params, channelAccountId: selectedLeadRadarParsingChannelAccountId || undefined });
      } catch (error) {
        if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
          setSelectedLeadRadarParsingChannelAccountId(null);
          showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token)
  });
};

export const useLeadRadarNegativeKeywords = () => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  return useQuery({
    queryKey: ["leadradar-negative-keywords", scope],
    queryFn: async () => {
      try {
        return await leadradarApi.listNegativeKeywords(token ?? "", selectedLeadRadarParsingChannelAccountId || undefined);
      } catch (error) {
        if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
          setSelectedLeadRadarParsingChannelAccountId(null);
          showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token)
  });
};

export const useLeadRadarSettings = () => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const { setSelectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  return useQuery({
    queryKey: ["leadradar-settings", scope],
    queryFn: async () => {
      try {
        return await leadradarApi.getSettings(token ?? "", selectedLeadRadarParsingChannelAccountId || undefined);
      } catch (error) {
        if (selectedLeadRadarParsingChannelAccountId && isLeadRadarParsingSelectionError(error)) {
          setSelectedLeadRadarParsingChannelAccountId(null);
          showAccountRecoveryAlert("Аккаунт парсинга недоступен. Выберите аккаунт заново.");
        }
        throw error;
      }
    },
    enabled: Boolean(token)
  });
};

export const useLeadRadarConfigActions = () => {
  const { token, company, user } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const qc = useQueryClient();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${selectedLeadRadarParsingChannelAccountId}`;
  const invalidate = (key: string) => void qc.invalidateQueries({ queryKey: [key, scope] });

  return {
    addSource: useMutation({
      mutationFn: (input: { telegramChatId: string; chatTitle?: string | null; chatType?: string | null }) =>
        leadradarApi.addSource(token ?? "", input, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-sources")
    }),
    addSourceByLink: useMutation({
      mutationFn: (input: { link: string }) => leadradarApi.addSourceByLink(token ?? "", input, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-sources")
    }),
    updateSource: useMutation({
      mutationFn: (input: { id: string; isActive: boolean }) => leadradarApi.updateSource(token ?? "", input.id, { isActive: input.isActive }, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-sources")
    }),
    removeSource: useMutation({
      mutationFn: (id: string) => leadradarApi.removeSource(token ?? "", id, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-sources")
    }),

    addKeyword: useMutation({
      mutationFn: (input: {
        keyword: string;
        target?: import("@/lib/api/types").LeadRadarKeywordTarget;
        matchType: string;
        category: string;
        priority?: number;
      }) =>
        leadradarApi.addKeyword(token ?? "", input, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-keywords")
    }),
    updateKeyword: useMutation({
      mutationFn: (input: {
        id: string;
        patch: Partial<{
          keyword: string;
          target: import("@/lib/api/types").LeadRadarKeywordTarget;
          matchType: string;
          category: string;
          priority: number;
          isActive: boolean;
        }>;
      }) => leadradarApi.updateKeyword(token ?? "", input.id, input.patch, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-keywords")
    }),
    removeKeyword: useMutation({
      mutationFn: (id: string) => leadradarApi.removeKeyword(token ?? "", id, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-keywords")
    }),
    bulkAddKeywords: useMutation({
      mutationFn: (input: {
        channelAccountId: string;
        keywords: Array<{
          keyword: string;
          matchType: string;
          target?: import("@/lib/api/types").LeadRadarKeywordTarget;
          category: string;
          priority?: number;
        }>;
      }) => leadradarApi.bulkAddKeywords(token ?? "", input),
      onSuccess: () => invalidate("leadradar-keywords")
    }),

    addNegativeKeyword: useMutation({
      mutationFn: (input: { phrase: string }) => leadradarApi.addNegativeKeyword(token ?? "", input, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-negative-keywords")
    }),
    updateNegativeKeyword: useMutation({
      mutationFn: (input: { id: string; patch: Partial<{ phrase: string; isActive: boolean }> }) =>
        leadradarApi.updateNegativeKeyword(token ?? "", input.id, input.patch, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-negative-keywords")
    }),
    removeNegativeKeyword: useMutation({
      mutationFn: (id: string) => leadradarApi.removeNegativeKeyword(token ?? "", id, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-negative-keywords")
    }),

    updateSettings: useMutation({
      mutationFn: (patch: Partial<import("@/lib/api/types").LeadRadarSettingsResponse>) =>
        leadradarApi.updateSettings(token ?? "", patch, selectedLeadRadarParsingChannelAccountId || undefined),
      onSuccess: () => invalidate("leadradar-settings")
    })
  };
};

export const useLeadRadarAiSetupGenerate = () => {
  const { token } = useAuth();
  return useMutation({
    mutationFn: (input: { description: string }) => leadradarApi.generateAiSetup(token ?? "", input)
  });
};

export const useSendMessageMutation = (conversationId: string) => {
  const { token, company, user } = useAuth();
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const channelAccountId = selectedChannelAccountId;
  const qc = useQueryClient();
  const scope = `${baseScopeKey(company?.id, user?.id)}:${channelAccountId}`;
  return useMutation({
    mutationFn: (text: string) => conversationsApi.sendMessage(token ?? "", conversationId, text, channelAccountId || undefined),
    onSuccess: () => {
      // Scope can be stale briefly during Telegram account switching.
      // Invalidate by conversationId to guarantee correct dialog refresh.
      void qc.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) && q.queryKey[0] === "messages" && q.queryKey[2] === conversationId
      });
      void qc.invalidateQueries({ queryKey: ["conversations", scope] });
      void qc.invalidateQueries({ queryKey: ["dashboard-overview", baseScopeKey(company?.id, user?.id)] });
      void qc.invalidateQueries({ queryKey: ["dashboard-sales", baseScopeKey(company?.id, user?.id)] });
    }
  });
};

export const useSuggestReplyMutation = (conversationId: string) => {
  const { token, company, user } = useAuth();
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const channelAccountId = selectedChannelAccountId;
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
    void qc.invalidateQueries({ queryKey: ["dashboard-sales", scope] });
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
  const { selectedChannelAccountId } = useSelectedTelegramChannelAccountId();
  const qc = useQueryClient();
  const scope = baseScopeKey(company?.id, user?.id);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["telegram-account", scope] });
    void qc.invalidateQueries({ queryKey: ["telegram-accounts", scope] });
    void qc.invalidateQueries({ queryKey: ["dashboard-overview", scope] });
    void qc.invalidateQueries({ queryKey: ["dashboard-sales", scope] });
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
      mutationFn: () =>
        telegramApi.sync(token ?? "", selectedChannelAccountId ? { channelAccountId: selectedChannelAccountId } : undefined),
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
    }),
    patchAccountFlags: useMutation({
      mutationFn: (input: { channelAccountId: string; sendingEnabled?: boolean; parsingEnabled?: boolean }) =>
        telegramApi.patchAccount(token ?? "", input.channelAccountId, {
          sendingEnabled: input.sendingEnabled,
          parsingEnabled: input.parsingEnabled
        }),
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
