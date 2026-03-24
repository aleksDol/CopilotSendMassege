import { Suspense } from "react";
import { MarketingTopNav } from "@/components/layout/marketing-top-nav";
import { SiteFooter } from "@/components/layout/site-footer";

export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <Suspense fallback={<div className="sticky top-0 z-50 h-[57px] border-b border-border bg-background/80 backdrop-blur" aria-hidden />}>
        <MarketingTopNav />
      </Suspense>

      <div className="flex flex-1 flex-col">{children}</div>

      <SiteFooter variant="full" />
    </div>
  );
}
