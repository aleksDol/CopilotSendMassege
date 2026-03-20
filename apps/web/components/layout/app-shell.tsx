"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

const SIDEBAR_OPEN_STORAGE_KEY = "app-sidebar-open";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const isChatsPage = pathname === "/chats" || pathname.startsWith("/chats/");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_OPEN_STORAGE_KEY);
      setIsSidebarOpen(stored === "1");
    } catch {
      setIsSidebarOpen(false);
    }
  }, []);

  const setSidebarOpen = (next: boolean) => {
    setIsSidebarOpen(next);
    try {
      window.localStorage.setItem(SIDEBAR_OPEN_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // ignore storage failures
    }
  };

  return (
    <div className="relative flex h-screen min-h-screen overflow-hidden bg-background">
      <div className="relative z-20 shrink-0">
        <AppSidebar forceCollapsed onExpandRequest={() => setSidebarOpen(true)} />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader onSidebarToggle={() => setSidebarOpen(!isSidebarOpen)} isSidebarOpen={isSidebarOpen} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={isChatsPage ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "flex min-h-0 flex-1 flex-col overflow-auto px-4 py-4 md:px-6 md:py-5"}>
            {children}
          </div>
        </main>
      </div>

      {isSidebarOpen ? (
        <button
          type="button"
          className="absolute inset-y-0 left-16 right-0 z-30 bg-background/45 transition-opacity"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      {isSidebarOpen ? (
        <div className="absolute inset-y-0 left-0 z-40">
          <AppSidebar onClose={() => setSidebarOpen(false)} forceExpanded />
        </div>
      ) : null}
    </div>
  );
}
