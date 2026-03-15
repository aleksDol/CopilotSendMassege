"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/context";

export default function HomePage() {
  const router = useRouter();
  const { isInitializing, isAuthenticated } = useAuth();

  useEffect(() => {
    if (isInitializing) {
      return;
    }

    if (isAuthenticated) {
      router.replace("/dashboard");
      return;
    }

    router.replace("/login");
  }, [isInitializing, isAuthenticated, router]);

  return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">Перенаправление...</div>;
}
