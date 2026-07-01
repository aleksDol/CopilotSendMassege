"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { sourceMarketplaceApi } from "@/lib/api/source-marketplace";
import { useAuth } from "@/lib/auth/context";
import { cn } from "@/lib/utils/cn";

const baseItems = [
  { href: "/leadradar", label: "Лиды" },
  { href: "/leadradar/marketplace", label: "Источники" },
  { href: "/leadradar/sources", label: "Подключённые чаты" },
  { href: "/leadradar/keywords", label: "Ключевые слова" },
  { href: "/leadradar/setup", label: "AI настройка" },
  { href: "/leadradar/negative-keywords", label: "Минус-слова" },
  { href: "/leadradar/settings", label: "Настройки" }
];

const catalogItem = { href: "/leadradar/catalog", label: "Каталог источников" };

export function LeadRadarNav() {
  const pathname = usePathname();
  const { token } = useAuth();
  const [isCatalogAdmin, setIsCatalogAdmin] = useState(false);

  useEffect(() => {
    if (!token) {
      setIsCatalogAdmin(false);
      return;
    }

    let cancelled = false;
    void sourceMarketplaceApi
      .listTopics(token)
      .then(() => {
        if (!cancelled) setIsCatalogAdmin(true);
      })
      .catch(() => {
        if (!cancelled) setIsCatalogAdmin(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const items = useMemo(() => (isCatalogAdmin ? [...baseItems, catalogItem] : baseItems), [isCatalogAdmin]);

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => {
        const active =
          pathname === i.href ||
          (i.href !== "/leadradar" && pathname.startsWith(`${i.href}/`)) ||
          (i.href === "/leadradar" && pathname === "/leadradar");
        return (
          <Link
            key={i.href}
            href={i.href}
            className={cn(
              "rounded-md border border-border px-3 py-1.5 text-sm transition",
              active ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            {i.label}
          </Link>
        );
      })}
    </div>
  );
}
