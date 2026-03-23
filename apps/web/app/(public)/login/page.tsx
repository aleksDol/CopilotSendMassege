"use client";

import { FormEvent, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmailCodeVerificationCard } from "@/components/auth/email-code-verification-card";
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
  const [step, setStep] = useState<"credentials" | "code">("credentials");
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const resendIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startResendTimer = () => {
    if (resendIntervalRef.current) {
      clearInterval(resendIntervalRef.current);
    }
    setResendIn(60);
    resendIntervalRef.current = setInterval(() => {
      setResendIn((value) => {
        if (value <= 1) {
          if (resendIntervalRef.current) {
            clearInterval(resendIntervalRef.current);
            resendIntervalRef.current = null;
          }
          return 0;
        }
        return value - 1;
      });
    }, 1000);
  };

  useEffect(() => {
    return () => {
      if (resendIntervalRef.current) {
        clearInterval(resendIntervalRef.current);
      }
    };
  }, []);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (step === "credentials") {
        const response = await authApi.loginRequestCode({ email, password });
        setChallengeId(response.challengeId);
        setStep("code");
        setNotice(`Мы отправили код на почту ${email}`);
        startResendTimer();
        return;
      }

      if (!challengeId) {
        throw new Error("Сессия подтверждения не найдена. Начните вход заново.");
      }

      const response = await authApi.loginVerifyCode({ email, challengeId, code });
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
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={step === "code"}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={step === "code"}
            />
          </div>
          {step === "credentials" && error ? <p className="text-sm text-destructive">{error}</p> : null}
          {step === "credentials" ? (
            <Button className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Проверяем..." : "Продолжить"}
            </Button>
          ) : (
            <EmailCodeVerificationCard
              email={email}
              code={code}
              isSubmitting={isSubmitting}
              error={error}
              info={notice}
              resendIn={resendIn}
              ctaText="Войти"
              backText="Изменить email"
              onCodeChange={setCode}
              onBack={() => {
                setStep("credentials");
                setCode("");
                setChallengeId(null);
                setNotice(null);
                setError(null);
              }}
              onResend={async () => {
                try {
                  setError(null);
                  setSubmitting(true);
                  const response = await authApi.resendLoginCode({ email, challengeId: challengeId as string });
                  setChallengeId(response.challengeId);
                  setNotice(`Новый код отправлен на ${email}`);
                  startResendTimer();
                } catch (submitError) {
                  setError(submitError instanceof Error ? submitError.message : "Не удалось отправить код");
                } finally {
                  setSubmitting(false);
                }
              }}
            />
          )}
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
