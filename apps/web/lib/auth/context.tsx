"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { clearStoredToken, getStoredToken, setStoredToken } from "@/lib/auth/token";
import { apiClient } from "@/lib/api/client";

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
  isInitializing: boolean;
  isAuthenticated: boolean;
  setSession: (token: string, user: AuthUser, company: AuthCompany) => void;
  refreshMe: () => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [company, setCompany] = useState<AuthCompany | null>(null);
  const [isInitializing, setInitializing] = useState(true);

  const logout = useCallback(() => {
    clearStoredToken();
    setToken(null);
    setUser(null);
    setCompany(null);
  }, []);

  const refreshMe = useCallback(async () => {
    const stored = getStoredToken();
    if (!stored) {
      logout();
      return;
    }

    try {
      const me = await apiClient.get<{ user: AuthUser; company: AuthCompany }>("/auth/me", { token: stored });
      setToken(stored);
      setUser(me.user);
      setCompany(me.company);
    } catch {
      logout();
    }
  }, [logout]);

  const setSession = useCallback((nextToken: string, nextUser: AuthUser, nextCompany: AuthCompany) => {
    setStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setCompany(nextCompany);
  }, []);

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
      isInitializing,
      isAuthenticated: Boolean(token && user),
      setSession,
      refreshMe,
      logout
    }),
    [token, user, company, isInitializing, setSession, refreshMe, logout]
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
