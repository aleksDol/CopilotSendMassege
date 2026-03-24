"use client";

import { Sparkles } from "lucide-react";
import { TrackingLink } from "@/components/marketing/tracking-link";
import { SERVICE_DISPLAY_NAME } from "@/lib/constants/service";

const baseButton =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const smButton = "h-9 px-3";
const outlineSm = `${baseButton} ${smButton} border border-border bg-background hover:bg-muted`;
const defaultSm = `${baseButton} ${smButton} bg-primary text-primary-foreground hover:brightness-110`;

export function MarketingTopNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 md:px-8">
        <TrackingLink href="/home" className="flex items-center gap-2">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="text-sm font-semibold">{SERVICE_DISPLAY_NAME}</span>
        </TrackingLink>

        <nav className="flex items-center gap-2">
          <TrackingLink href="/login" className={outlineSm}>
            Войти
          </TrackingLink>
          <TrackingLink href="/register" className={defaultSm}>
            Зарегистрироваться
          </TrackingLink>
        </nav>
      </div>
    </header>
  );
}
