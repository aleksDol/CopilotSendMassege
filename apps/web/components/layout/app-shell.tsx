import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-h-0 overflow-hidden">
        <AppHeader />
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {children}
        </main>
      </div>
    </div>
  );
}
