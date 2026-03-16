"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TelegramAccountResponse } from "@/lib/api/types";

const POLL_INTERVAL_MS = 2500;

export function TelegramConnectCard({
  account,
  onStartQr,
  onPollQr,
  onVerifyPasswordQr,
  onSync,
  loading
}: {
  account?: TelegramAccountResponse;
  onStartQr: () => Promise<{ qrSessionId: string; qrUrl: string; expiresAt: number }>;
  onPollQr: (qrSessionId: string) => Promise<{ status: string; expiresAt: number; errorMessage?: string | null }>;
  onVerifyPasswordQr: (payload: { qrSessionId: string; password: string }) => Promise<{ status: string }>;
  onSync: () => Promise<void>;
  loading?: boolean;
}) {
  const flowStatus = account?.loginStatus ?? account?.status ?? "login_required";
  const isConnected = flowStatus === "connected";

  const [qrSessionId, setQrSessionId] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<number>(0);
  const [qrStatus, setQrStatus] = useState<string>("pending");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  const startPolling = useCallback(
    (sessionId: string) => {
      stopPolling();
      const id = setInterval(async () => {
        try {
          const result = await onPollQr(sessionId);
          setQrStatus(result.status);
          if (result.errorMessage) setError(result.errorMessage);
          if (result.status === "connected" || result.status === "expired" || result.status === "error") {
            stopPolling();
            if (result.status === "connected") {
              setQrSessionId(null);
              setQrUrl(null);
            }
          }
        } catch {
          stopPolling();
          setQrStatus("error");
        }
      }, POLL_INTERVAL_MS);
      pollIntervalRef.current = id;
    },
    [onPollQr, stopPolling]
  );

  useEffect(() => {
    return () => stopPolling();
  }, [stopPolling]);

  const handleStartQr = async () => {
    setError(null);
    setQrStatus("pending");
    try {
      const data = await onStartQr();
      setQrSessionId(data.qrSessionId);
      setQrUrl(data.qrUrl);
      setExpiresAt(data.expiresAt);
      startPolling(data.qrSessionId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить QR-код");
    }
  };

  const handleRefreshQr = () => {
    setQrSessionId(null);
    setQrUrl(null);
    setQrStatus("pending");
    setError(null);
    void handleStartQr();
  };

  const handleVerifyPassword = async () => {
    if (!qrSessionId) return;
    setError(null);
    try {
      await onVerifyPasswordQr({ qrSessionId, password });
      setQrSessionId(null);
      setQrUrl(null);
      setQrStatus("connected");
      stopPolling();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Неверный пароль");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Подключение Telegram</CardTitle>
        <CardDescription>Отсканируйте QR-код в приложении Telegram для входа.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-2 text-sm">
          <span>Статус:</span>
          <Badge variant={isConnected ? "success" : "warning"}>
            {isConnected ? "подключён" : qrSessionId ? qrStatus : flowStatus}
          </Badge>
        </div>

        {!isConnected && !qrUrl && (
          <Button className="w-full" disabled={loading} onClick={() => void handleStartQr()}>
            Войти по QR-коду
          </Button>
        )}

        {qrUrl && (
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-lg border bg-white p-3">
              <QRCodeSVG value={qrUrl} size={220} level="M" />
            </div>
            <p className="text-center text-sm text-muted-foreground">
              Откройте Telegram → Настройки → Устройства → Войти по QR-коду
            </p>
            {qrStatus === "pending" && (
              <p className="text-sm text-muted-foreground">Ожидание сканирования… QR действует 60 секунд.</p>
            )}
            {(qrStatus === "expired" || qrStatus === "error") && (
              <Button variant="outline" disabled={loading} onClick={handleRefreshQr}>
                Получить новый QR-код
              </Button>
            )}
            {qrStatus === "password_required" && (
              <div className="flex w-full max-w-sm flex-col gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">Пароль 2FA</div>
                  <Input
                    type="password"
                    placeholder="Пароль двухэтапной аутентификации"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <Button disabled={loading || !password} onClick={() => void handleVerifyPassword()}>
                  Подтвердить пароль
                </Button>
              </div>
            )}
          </div>
        )}

        {account?.username || account?.displayName ? (
          <div className="text-sm text-muted-foreground">
            Подключён: {account.displayName ?? "-"} {account.username ? `(@${account.username})` : ""}
          </div>
        ) : null}

        {(error || (flowStatus === "error" && account?.errorMessage)) ? (
          <p className="text-sm text-destructive">{error || account?.errorMessage}</p>
        ) : null}

        <Button
          variant="outline"
          disabled={loading || (flowStatus !== "connected" && flowStatus !== "error")}
          onClick={() => void onSync()}
        >
          Синхронизировать вручную
        </Button>
      </CardContent>
    </Card>
  );
}
