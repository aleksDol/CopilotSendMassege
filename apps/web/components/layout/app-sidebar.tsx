"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessageCircle,
  CheckSquare,
  BookOpen,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Users,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

const SIDEBAR_STORAGE_KEY = "app-sidebar-collapsed";

const navItems = [
  { href: "/dashboard", label: "Дашборд", icon: LayoutDashboard },
  { href: "/chats", label: "Чаты", icon: MessageCircle },
  { href: "/tasks", label: "Задачи", icon: CheckSquare }
];

const settingsItems = [
  { href: "/settings/knowledge", label: "База знаний", icon: BookOpen },
  { href: "/settings/reply-policy", label: "Политика ответов", icon: ShieldCheck },
  { href: "/settings/telegram", label: "Подключение Telegram", icon: Smartphone },
  { href: "/settings/billing", label: "Оплата", icon: CreditCard },
  { href: "/settings/team", label: "Команда", icon: Users }
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

export function AppSidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setCollapsed(getStoredCollapsed());
  }, []);

  const toggle = () => {
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

  return (
    <aside
      className={cn(
        "hidden shrink-0 border-r border-border bg-card/80 backdrop-blur transition-[width] duration-200 ease-out md:block",
        collapsed ? "w-16" : "w-72"
      )}
    >
      <div className={cn("flex items-center border-b border-border", collapsed ? "justify-center py-3" : "justify-between px-4 py-3")}>
        {!collapsed && (
          <div className="min-w-0 px-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">AI Sales Assistant</div>
            <div className="truncate text-lg font-semibold">Панель управления</div>
          </div>
        )}
        <button
          type="button"
          onClick={toggle}
          className={cn(
            "rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground",
            collapsed && "mx-auto"
          )}
          title={collapsed ? "Развернуть меню" : "Свернуть меню"}
          aria-label={collapsed ? "Развернуть меню" : "Свернуть меню"}
        >
          {collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
      </div>

      <nav className="space-y-1 px-2 py-2">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-sm transition",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-4 pt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground">Настройки</div>
      )}
      <nav className="space-y-1 px-2 pt-2">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg py-2 text-sm transition",
                collapsed ? "justify-center px-0" : "gap-3 px-3",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="mt-8 px-4 text-xs text-muted-foreground">MVP v1</div>
      )}
    </aside>
  );
}
