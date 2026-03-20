"use client";

import { useEffect, useState } from "react";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

const SIDEBAR_OPEN_STORAGE_KEY = "app-sidebar-open";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

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
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <AppHeader onSidebarToggle={() => setSidebarOpen(!isSidebarOpen)} isSidebarOpen={isSidebarOpen} />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>

      {isSidebarOpen ? (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-background/45 transition-opacity"
          aria-label="Close sidebar overlay"
          onClick={() => setSidebarOpen(false)}
        />
      ) : null}

      <div className="absolute inset-y-0 left-0 z-40">
        <AppSidebar
          onClose={() => setSidebarOpen(false)}
          forceCollapsed={!isSidebarOpen}
          forceExpanded={isSidebarOpen}
          onExpandRequest={() => setSidebarOpen(true)}
        />
      </div>
    </div>
  );
}
