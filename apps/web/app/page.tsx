"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

function RootRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isInitializing, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    const qs = searchParams.toString();
    const suffix = qs ? `?${qs}` : "";

    if (isAuthenticated) {
      router.replace(`/dashboard${suffix}`);
      return;
    }

    router.replace(`/login${suffix}`);
  }, [isInitializing, isAuthenticated, router, searchParams]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Перенаправление...</div>;
}

export default function HomePage() {
  return (
    <Suspense
      fallback={<div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Перенаправление...</div>}
    >
      <RootRedirect />
    </Suspense>
  );
}
