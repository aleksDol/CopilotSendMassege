import { AuthGuard } from "@/components/layout/auth-guard";
import { AppShell } from "@/components/layout/app-shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      </AppShell>
    </AuthGuard>
  );
}
