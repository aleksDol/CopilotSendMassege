"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmailCodeVerificationCard } from "@/components/auth/email-code-verification-card";
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
  const [step, setStep] = useState<"details" | "code">("details");
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
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("inviteToken");
    setInviteToken(token);
  }, []);

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
      if (inviteToken) {
        await teamApi.acceptInvite({ token: inviteToken, fullName, password });
        const loginResponse = await authApi.login({ email, password });
        setSession(loginResponse.token, loginResponse.user, loginResponse.company);
        router.replace("/dashboard");
      } else {
        if (step === "details") {
          const response = await authApi.registerRequestCode({ fullName, email, password, companyName });
          setChallengeId(response.challengeId);
          setStep("code");
          setNotice(`Мы отправили код на почту ${email}`);
          startResendTimer();
          return;
        }
        if (!challengeId) {
          throw new Error("Сессия подтверждения не найдена. Начните регистрацию заново.");
        }
        const response = await authApi.registerVerifyCode({ email, challengeId, code });
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
            <Input value={fullName} onChange={(event) => setFullName(event.target.value)} required disabled={step === "code" && !inviteToken} />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Email</label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={step === "code" && !inviteToken}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm">Пароль</label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={step === "code" && !inviteToken}
            />
          </div>
          {inviteToken ? null : (
            <div className="space-y-2">
              <label className="text-sm">Название компании</label>
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                required
                disabled={step === "code"}
              />
            </div>
          )}
          {step !== "code" || inviteToken ? (
            <>
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
              <Button className="w-full" disabled={isSubmitting || (!inviteToken && step === "code" && code.length !== 6)}>
                {isSubmitting ? "Обработка..." : inviteToken ? "Присоединиться" : "Получить код"}
              </Button>
            </>
          ) : (
            <EmailCodeVerificationCard
              email={email}
              code={code}
              isSubmitting={isSubmitting}
              error={error}
              info={notice}
              resendIn={resendIn}
              ctaText="Завершить регистрацию"
              backText="Изменить email"
              onCodeChange={setCode}
              onBack={() => {
                setStep("details");
                setCode("");
                setChallengeId(null);
                setNotice(null);
                setError(null);
              }}
              onResend={async () => {
                try {
                  setError(null);
                  setSubmitting(true);
                  const response = await authApi.resendRegisterCode({ email, challengeId: challengeId as string });
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
          Уже есть аккаунт?{" "}
          <Link href="/login" className="text-primary underline-offset-2 hover:underline">
            Войти
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
