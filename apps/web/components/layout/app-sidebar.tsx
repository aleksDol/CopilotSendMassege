"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CircleHelp,
  MessageCircle,
  CheckSquare,
  Radar,
  Database,
  Bot,
  Smartphone,
  CreditCard,
  Users,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/auth/context";

const SIDEBAR_STORAGE_KEY = "app-sidebar-collapsed";

const navItems = [
  { href: "/getting-started", label: "Начало работы", icon: CircleHelp },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chats", label: "Chats", icon: MessageCircle },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/base", label: "База", icon: Database },
  { href: "/leadradar", label: "LeadRadar", icon: Radar }
];

const settingsItems = [
  { href: "/settings/ai-brain", label: "AI Brain", icon: Bot },
  { href: "/settings/telegram", label: "Telegram Connection", icon: Smartphone },
  { href: "/settings/billing", label: "Billing", icon: CreditCard },
  { href: "/settings/team", label: "Team", icon: Users }
];

function getStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

export function AppSidebar({
  onClose,
  forceCollapsed = false,
  forceExpanded = false,
  onExpandRequest
}: {
  onClose?: () => void;
  forceCollapsed?: boolean;
  forceExpanded?: boolean;
  onExpandRequest?: () => void;
}) {
  const pathname = usePathname();
  const { access } = useAuth();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(getStoredCollapsed());
  }, []);

  const toggle = () => {
    if (forceCollapsed) {
      onExpandRequest?.();
      return;
    }
    if (forceExpanded) {
      onClose?.();
      return;
    }
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(SIDEBAR_STORAGE_KEY, next ? "1" : "0");
      } catch {
        // ignore
      }
      return next;
    });
  };

  const effectiveCollapsed = forceCollapsed ? true : forceExpanded ? false : collapsed;

  const isExpired = access?.subscriptionStatus === "expired";
  const visibleNavItems = isExpired ? navItems.filter((i) => i.href !== "/leadradar") : navItems;

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-card/95 backdrop-blur transition-[width] duration-200 ease-out",
        effectiveCollapsed ? "w-16" : "w-72"
      )}
    >
      <div className={cn("flex items-center border-b border-border", effectiveCollapsed ? "justify-center py-3" : "justify-between px-4 py-3")}>
        {!effectiveCollapsed && (
          <div className="min-w-0 px-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">AI Sales Assistant</div>
            <div className="truncate text-lg font-semibold">Control panel</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground",
            effectiveCollapsed && "mx-auto"
          )}
          title={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          aria-label={effectiveCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {effectiveCollapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <nav className="space-y-1 px-2 py-2">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={effectiveCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-sm transition",
                effectiveCollapsed ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!effectiveCollapsed && <div className="px-4 pt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Settings</div>}
      <nav className="space-y-1 px-2 pt-2">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              title={effectiveCollapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-sm transition",
                effectiveCollapsed ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!effectiveCollapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!effectiveCollapsed && <div className="mt-8 px-4 text-xs text-muted-foreground">MVP v1</div>}
    </aside>
  );
}
