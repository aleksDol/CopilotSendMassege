"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, CheckSquare, BookOpen, ShieldCheck, Smartphone, CreditCard, Users } from "lucide-react";
import { cn } from "@/lib/utils/cn";

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

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-72 shrink-0 border-r border-border bg-card/80 backdrop-blur md:block">
      <div className="p-6">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">AI Sales Assistant</div>
        <div className="mt-2 text-2xl font-semibold">Панель управления</div>
      </div>

      <nav className="space-y-1 px-3">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 px-6 text-xs uppercase tracking-[0.2em] text-muted-foreground">Настройки</div>
      <nav className="space-y-1 px-3 pt-2">
        {settingsItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition",
                active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8 px-6 text-xs text-muted-foreground">MVP v1</div>
    </aside>
  );
}
