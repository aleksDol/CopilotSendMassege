"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

const items = [
  { href: "/leadradar", label: "Inbox" },
  { href: "/leadradar/sources", label: "Sources" },
  { href: "/leadradar/keywords", label: "Keywords" },
  { href: "/leadradar/negative-keywords", label: "Negative" },
  { href: "/leadradar/settings", label: "Settings" }
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

