"use client";

import { FormEvent, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { useAuth } from "@/lib/auth/context";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const { setSession } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const response = await authApi.login({ email, password });
      setSession(response.token, response.user, response.company);
      router.replace(next);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка входа");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>С возвращением</CardTitle>
        <CardDescription>Войдите, чтобы продолжить работу с входящими продажами в Telegram.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm">Email</label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Пароль</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Вход..." : "Войти"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          Нет аккаунта?{" "}
          <Link href="/register" className="text-primary underline-offset-2 hover:underline">
            Зарегистрироваться
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted-foreground">Загрузка...</div>}>
      <LoginForm />
    </Suspense>
  );
}
