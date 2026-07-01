"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/context";
import { authApi } from "@/lib/api/auth";

type TelegramIdentity = {
  telegramUserId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  photoUrl: string | null;
  linkedAt: string;
  lastAuthAt: string | null;
};

export default function AccountSettingsPage() {
  const { token } = useAuth();
  const [telegram, setTelegram] = useState<TelegramIdentity | null>(null);
  const [isLoading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        return;
      }
      try {
        setLoading(true);
        const result = await authApi.telegramMe(token);
        setTelegram(result.telegram);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Не удалось загрузить профиль");
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [token]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Аккаунт</CardTitle>
        <CardDescription>Данные авторизации в SaaS через Telegram.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? <div className="text-sm text-muted-foreground">Загрузка...</div> : null}
        {error ? <div className="text-sm text-destructive">{error}</div> : null}
        {!isLoading && !error ? (
          telegram ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Telegram</div>
                <div className="font-medium">
                  {telegram.username ? `@${telegram.username}` : `ID ${telegram.telegramUserId}`}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Дата привязки</div>
                <div className="font-medium">{new Date(telegram.linkedAt).toLocaleString()}</div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="text-muted-foreground">Последний вход</div>
                <div className="font-medium">{telegram.lastAuthAt ? new Date(telegram.lastAuthAt).toLocaleString() : "—"}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">Telegram не привязан.</div>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}

