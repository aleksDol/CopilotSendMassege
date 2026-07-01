"use client";

import { FormEvent, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { authApi } from "@/lib/api/auth";
import { ApiError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/context";

function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const { setSession } = useAuth();

  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [loginToken, setLoginToken] = useState<string | null>(null);
  const [botUsername, setBotUsername] = useState<string | null>(null);
  const [telegramFullName, setTelegramFullName] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const telegramPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTelegramPolling = useCallback(() => {
    if (telegramPollingRef.current) {
      clearInterval(telegramPollingRef.current);
      telegramPollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      stopTelegramPolling();
    };
  }, [stopTelegramPolling]);

  const pollTelegramLogin = useCallback(
    (token: string) => {
      stopTelegramPolling();
      telegramPollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const response = await authApi.telegramComplete({ loginToken: token });
            stopTelegramPolling();

            if (response.status === "registration_required") {
              setLoginToken(response.loginToken);
              setTelegramFullName(response.fullName);
              setNotice(null);
              setError(null);
              return;
            }

            setSession(response.token, response.user, response.company, response.access);
            router.replace(next);
          } catch (pollError) {
            if (pollError instanceof ApiError && pollError.code === "LOGIN_NOT_CONFIRMED") {
              return;
            }

            stopTelegramPolling();
            if (pollError instanceof ApiError && pollError.code === "LOGIN_TOKEN_EXPIRED") {
              setError("Время ожидания истекло. Начните вход через Telegram заново.");
              setLoginToken(null);
              setBotUsername(null);
              setTelegramFullName(null);
              setCompanyName("");
              setNotice(null);
            } else {
              setError(pollError instanceof Error ? pollError.message : "Ошибка входа через Telegram");
              setLoginToken(null);
              setBotUsername(null);
              setTelegramFullName(null);
              setCompanyName("");
              setNotice(null);
            }
          }
        })();
      }, 2000);
    },
    [next, router, setSession, stopTelegramPolling]
  );

  const onTelegramLogin = async () => {
    setError(null);
    setNotice(null);
    setSubmitting(true);

    try {
      const response = await authApi.telegramStart();
      setLoginToken(response.loginToken);
      setBotUsername(response.botUsername);
      setNotice("Подтвердите вход в Telegram");
      window.open(`https://t.me/${response.botUsername}?start=${response.loginToken}`, "_blank", "noopener,noreferrer");
      pollTelegramLogin(response.loginToken);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось начать вход через Telegram");
    } finally {
      setSubmitting(false);
    }
  };

  const onTelegramRegister = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!loginToken) {
      setError("Сессия регистрации не найдена. Начните вход через Telegram заново.");
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const response = await authApi.telegramRegister({ loginToken, companyName });
      setSession(response.token, response.user, response.company, response.access);
      router.replace("/onboarding");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Не удалось создать рабочее пространство");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>AI Sales Assistant</CardTitle>
        <CardDescription>Войдите, чтобы продолжить работу с входящими продажами в Telegram.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Этот Telegram используется только для входа. Для поиска клиентов рабочий аккаунт подключается отдельно.
        </p>
        {telegramFullName ? (
          <form className="space-y-4" onSubmit={onTelegramRegister}>
            <div className="space-y-1">
              <p className="text-lg font-medium">Добро пожаловать</p>
              <p className="text-sm text-muted-foreground">{telegramFullName}</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm">Название компании</label>
              <Input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Например, Acme Sales"
                required
                minLength={2}
              />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" disabled={isSubmitting}>
              {isSubmitting ? "Создаём..." : "Создать рабочее пространство"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setLoginToken(null);
                setBotUsername(null);
                setTelegramFullName(null);
                setCompanyName("");
                setError(null);
              }}
            >
              Вернуться к входу
            </Button>
          </form>
        ) : loginToken ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Подтвердите вход в Telegram
              {botUsername ? (
                <>
                  {" "}
                  через бота{" "}
                  <a
                    href={`https://t.me/${botUsername}?start=${loginToken ?? ""}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary underline-offset-2 hover:underline"
                  >
                    @{botUsername}
                  </a>
                </>
              ) : null}
              .
            </p>
            {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                stopTelegramPolling();
                setLoginToken(null);
                setBotUsername(null);
                setTelegramFullName(null);
                setCompanyName("");
                setNotice(null);
                setError(null);
              }}
            >
              Отменить
            </Button>
          </div>
        ) : (
          <Button type="button" className="w-full" disabled={isSubmitting} onClick={() => void onTelegramLogin()}>
            {isSubmitting ? "Открываем Telegram..." : "Войти через Telegram"}
          </Button>
        )}
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
