"use client";

import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isInitializing } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!isInitializing && !isAuthenticated) {
      const query = searchParams.toString();
      const returnTo = query ? `${pathname}?${query}` : pathname;
      router.replace(`/login?next=${encodeURIComponent(returnTo)}`);
    }
  }, [isInitializing, isAuthenticated, router, pathname, searchParams]);

  if (isInitializing) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Загрузка...</div>;
  }

  if (!isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
