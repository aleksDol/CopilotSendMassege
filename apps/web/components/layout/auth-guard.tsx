"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isInitializing, isAuthenticated, router, pathname]);

  if (isInitializing) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Загрузка...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
