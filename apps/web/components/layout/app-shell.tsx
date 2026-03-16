import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen min-h-screen overflow-hidden bg-background">
      <AppSidebar />
      <div className="flex flex-1 flex-col min-h-0">
        <AppHeader />
        <main className="flex-1 min-h-0 overflow-auto p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
