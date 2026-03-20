"use client";

import Link from "next/link";
import { LogOut, PanelLeft, Power, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/context";
import { useTelegramAccount } from "@/lib/hooks/use-app-data";

export function AppHeader({
  onSidebarToggle,
  isSidebarOpen
}: {
  onSidebarToggle: () => void;
  isSidebarOpen: boolean;
}) {
  const { company, user, logout } = useAuth();
  const telegram = useTelegramAccount();

  const loginStatus = telegram.data?.loginStatus ?? telegram.data?.status ?? "unknown";

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-background/80 px-4 backdrop-blur md:px-8">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={onSidebarToggle}
          aria-label={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
          title={isSidebarOpen ? "Close sidebar" : "Open sidebar"}
        >
          <PanelLeft className="h-5 w-5" />
        </Button>
        <div className="text-sm text-muted-foreground">Workspace</div>
        <div className="font-semibold">{company?.name ?? "-"}</div>
        <Badge variant={loginStatus === "connected" ? "success" : "warning"}>
          {loginStatus === "connected" ? "connected" : loginStatus === "login_required" ? "login required" : loginStatus}
        </Badge>
      </div>

      <div className="flex items-center gap-2">
        <Link href="/settings/telegram">
          <Button variant="outline" size="sm" className="gap-2">
            <Power className="h-4 w-4" />
            Telegram
          </Button>
        </Link>
        <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm">
          <UserRound className="h-4 w-4 text-muted-foreground" />
          <span>{user?.fullName ?? "User"}</span>
        </div>
        <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground" onClick={logout}>
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </header>
  );
}
