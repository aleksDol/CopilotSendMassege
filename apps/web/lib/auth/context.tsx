"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth/token";
import { apiClient } from "@/lib/api/client";
import type { AccessState } from "@/lib/api/types";

type AuthUser = {
  id: string;
  email: string;
  fullName: string;
  role: string;
  companyId: string;
};

type AuthCompany = {
  id: string;
  name: string;
  slug: string;
  plan: string;
  timezone: string;
};

type AuthContextValue = {
  token: string | null;
  user: AuthUser | null;
  company: AuthCompany | null;
  access: AccessState | null;
  isInitializing: boolean;
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser, company: AuthCompany, access: AccessState) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<AuthCompany | null>(null);
  const [access, setAccess] = useState<AccessState | null>(null);
  const [isInitializing, setInitializing] = useState(true);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setCompany(null);
    setAccess(null);
    // Clear all cached API data so the next account never sees the previous account's data (chats, messages, etc.)
    queryClient.clear();
  }, [queryClient]);

  const refreshMe = useCallback(async () => {
    const stored = getStoredToken();
    if (!stored) {
      logout();
      return;
    }

    try {
      const me = await apiClient.get<{ user: AuthUser; company: AuthCompany; access: AccessState }>("/auth/me", { token: stored });
      setToken(stored);
      setUser(me.user);
      setCompany(me.company);
      setAccess(me.access);
    } catch {
      logout();
    }
  }, [logout]);

  const setSession = useCallback(
    (nextToken: string, nextUser: AuthUser, nextCompany: AuthCompany, nextAccess: AccessState) => {
      // Clear any cached data from a previous account so the new session never sees it
      queryClient.clear();
      setStoredToken(nextToken);
      setToken(nextToken);
      setUser(nextUser);
      setCompany(nextCompany);
      setAccess(nextAccess);
    },
    [queryClient]
  );

  useEffect(() => {
    const init = async () => {
      await refreshMe();
      setInitializing(false);
    };

    void init();
  }, [refreshMe]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      company,
      access,
      isInitializing,
      isAuthenticated: Boolean(token && user),
      setSession,
      refreshMe,
      logout
    }),
    [token, user, company, access, isInitializing, setSession, refreshMe, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
};
