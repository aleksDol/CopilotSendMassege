"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { teamApi } from "@/lib/api/team";
import { useAuth } from "@/lib/auth/context";

export default function RegisterPage() {
  const router = useRouter();
  const [inviteToken, setInviteToken] = useState<string | null>(null);
  const { setSession } = useAuth();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("inviteToken");
    setInviteToken(token);
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (inviteToken) {
        await teamApi.acceptInvite({ token: inviteToken, fullName, password });
        const loginResponse = await authApi.login({ email, password });
        setSession(loginResponse.token, loginResponse.user, loginResponse.company);
        router.replace("/dashboard");
      } else {
        const response = await authApi.register({ fullName, email, password, companyName });
        setSession(response.token, response.user, response.company);
        router.replace("/onboarding");
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ошибка регистрации");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{inviteToken ? "Принять приглашение в команду" : "Создать рабочее пространство"}</CardTitle>
        <CardDescription>
          {inviteToken ? "Создайте аккаунт, чтобы присоединиться к рабочему пространству." : "Запустите AI Sales Assistant менее чем за 2 минуты."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <label className="text-sm">ФИО</label>
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Email</label>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Пароль</label>
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </div>
          {inviteToken ? null : (
            <div className="space-y-2">
              <label className="text-sm">Название компании</label>
              <Input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
            </div>
          )}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button className="w-full" disabled={isSubmitting}>
            {isSubmitting ? "Создание аккаунта..." : inviteToken ? "Присоединиться" : "Создать аккаунт"}
          </Button>
        </form>

        <p className="mt-4 text-sm text-muted-foreground">
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-primary underline-offset-2 hover:underline">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
