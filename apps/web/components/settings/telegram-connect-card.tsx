"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TelegramAccountResponse } from "@/lib/api/types";

export function TelegramConnectCard({
  account,
  onStart,
  onVerifyCode,
  onVerifyPassword,
  onSync,
  loading
}: {
  account?: TelegramAccountResponse;
  onStart: (phone: string) => Promise<{ status: string; requiresPassword?: boolean }>;
  onVerifyCode: (phone: string, code: string) => Promise<{ status: string; requiresPassword?: boolean }>;
  onVerifyPassword: (phone: string, password: string) => Promise<{ status: string; requiresPassword?: boolean }>;
  onSync: () => Promise<void>;
  loading?: boolean;
}) {
  const [phone, setPhone] = useState(account?.phone ?? "");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [flowStatus, setFlowStatus] = useState<string>(account?.loginStatus ?? account?.status ?? "login_required");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPhone(account?.phone ?? "");
    setFlowStatus(account?.loginStatus ?? account?.status ?? "login_required");
  }, [account?.phone, account?.loginStatus, account?.status]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Подключение Telegram</CardTitle>
        <CardDescription>Подключите личный аккаунт Telegram для синхронизации входящих.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span>Статус:</span>
          <Badge variant={flowStatus === "connected" ? "success" : "warning"}>{flowStatus === "connected" ? "подключён" : flowStatus}</Badge>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <div className="text-xs text-muted-foreground">Телефон</div>
            <Input placeholder="+79991234567" value={phone} onChange={(event) => setPhone(event.target.value)} />
          </div>
          <div className="flex items-end">
            <Button
              className="w-full"
              disabled={loading || !phone}
              onClick={async () => {
                setError(null);
                try {
                  const result = await onStart(phone);
                  setFlowStatus(result.status);
                } catch (startError) {
                  setError(startError instanceof Error ? startError.message : "Не удалось начать подключение");
                }
              }}
            >
              Отправить код
            </Button>
          </div>
        </div>

        {(flowStatus === "code_sent" || flowStatus === "password_required") && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Код подтверждения</div>
              <Input value={code} onChange={(event) => setCode(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                variant="secondary"
                disabled={loading || !phone || !code}
                onClick={async () => {
                  setError(null);
                  try {
                    const result = await onVerifyCode(phone, code);
                    setFlowStatus(result.status);
                  } catch (verifyError) {
                    setError(verifyError instanceof Error ? verifyError.message : "Неверный или истёкший код");
                  }
                }}
              >
                Подтвердить код
              </Button>
            </div>
          </div>
        )}

        {flowStatus === "password_required" && (
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="text-xs text-muted-foreground">Пароль 2FA</div>
              <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                variant="secondary"
                disabled={loading || !phone || !password}
                onClick={async () => {
                  setError(null);
                  try {
                    const result = await onVerifyPassword(phone, password);
                    setFlowStatus(result.status);
                  } catch (verifyError) {
                    setError(verifyError instanceof Error ? verifyError.message : "Неверный пароль");
                  }
                }}
              >
                Подтвердить пароль
              </Button>
            </div>
          </div>
        )}

        {account?.username || account?.displayName ? (
          <div className="text-sm text-muted-foreground">
            Подключён: {account.displayName ?? "-"} {account.username ? `(@${account.username})` : ""}
          </div>
        ) : null}

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        <Button variant="outline" disabled={loading || flowStatus !== "connected"} onClick={() => void onSync()}>
          Синхронизировать вручную
        </Button>
      </CardContent>
    </Card>
  );
}
