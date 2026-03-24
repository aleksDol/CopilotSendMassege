import { Suspense } from "react";
import { MarketingShell } from "@/components/layout/marketing-shell";

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return (
    <MarketingShell>
      <Suspense fallback={null}>{children}</Suspense>
    </MarketingShell>
  );
}
