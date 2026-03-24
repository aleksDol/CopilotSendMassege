"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { useAuth } from "@/lib/auth/context";

const SALES_URL = (process.env.NEXT_PUBLIC_SALES_TELEGRAM_URL ?? "").trim() || "https://t.me";

const formatTimeLeft = (timeLeftMs: number | null): string => {
  if (timeLeftMs === null) return "";
  const hours = Math.max(0, Math.ceil(timeLeftMs / (60 * 60 * 1000)));
  if (hours >= 48) {
    const days = Math.ceil(hours / 24);
    return `Осталось ${days} ${days === 1 ? "день" : "дня"}`;
  }
  if (hours > 1) {
    return `Осталось ${hours} ч.`;
  }
  return "Осталось меньше часа";
};

export function TrialAccessBanner({ className }: { className?: string }) {
  const { access } = useAuth();
  const [isDismissed, setDismissed] = useState(false);

  const config = useMemo(() => {
    if (!access) return null;

    if (access.subscriptionStatus === "trial") {
      const isUrgent = (access.timeLeftMs ?? 0) <= 24 * 60 * 60 * 1000;
      if (isUrgent) {
        return {
          title: "Пробный период скоро закончится",
          subtitle: "Чтобы продолжить работать без ограничений, подключите доступ",
          timeLeft: "Остался 1 день",
          tone: "warning" as const,
          cta: "Получить доступ"
        };
      }

      return {
        title: "У вас пробный доступ",
        subtitle: "Попробуйте все функции сервиса бесплатно",
        timeLeft: formatTimeLeft(access.timeLeftMs),
        tone: "info" as const,
        cta: "Получить полный доступ"
      };
    }

    if (access.subscriptionStatus === "expired") {
      return {
        title: "Пробный период закончился",
        subtitle: "Чтобы продолжить работу с клиентами и использовать AI - подключите доступ",
        timeLeft: "Данные и чаты сохранены",
        tone: "warning" as const,
        cta: "Получить доступ"
      };
    }

    return null;
  }, [access]);

  useEffect(() => {
    setDismissed(false);
  }, [access?.subscriptionStatus]);

  if (!config || isDismissed) return null;

  const toneClass = config.tone === "warning" ? "border-warning/50 bg-warning/10" : "border-primary/25 bg-primary/10";

  return (
    <div className={`rounded-xl border px-4 py-3 ${toneClass} ${className ?? ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <p className="text-sm font-semibold">{config.title}</p>
          <p className="text-sm text-muted-foreground">{config.subtitle}</p>
          <p className="text-xs font-medium text-foreground/80">{config.timeLeft}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-background/60"
            onClick={() => setDismissed(true)}
          >
            Скрыть
          </button>
          <Link
            href={SALES_URL}
            target="_blank"
            rel="noreferrer"
            className={cn(buttonVariants({ size: "sm", variant: "secondary" }))}
          >
            {config.cta}
          </Link>
        </div>
      </div>
    </div>
  );
}
