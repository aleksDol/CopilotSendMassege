import { Suspense } from "react";
import { AuthGuard } from "@/components/layout/auth-guard";
import { AppShell } from "@/components/layout/app-shell";
import { TrialAccessBanner } from "@/components/billing/trial-access-banner";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Загрузка...</div>}
    >
      <AuthGuard>
        <AppShell>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <TrialAccessBanner className="mx-4 mt-4 md:mx-6" />
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </div>
        </AppShell>
      </AuthGuard>
    </Suspense>
  );
}
