"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/leadradar", label: "\u041b\u0438\u0434\u044b" },
  { href: "/leadradar/sources", label: "\u0418\u0441\u0442\u043e\u0447\u043d\u0438\u043a\u0438" },
  { href: "/leadradar/keywords", label: "\u041a\u043b\u044e\u0447\u0435\u0432\u044b\u0435 \u0441\u043b\u043e\u0432\u0430" },
  { href: "/leadradar/negative-keywords", label: "\u041c\u0438\u043d\u0443\u0441-\u0441\u043b\u043e\u0432\u0430" },
  { href: "/leadradar/settings", label: "\u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0438" }
];

export function LeadRadarNav() {
  const pathname = usePathname();

  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => {
        const active = pathname === i.href;
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
