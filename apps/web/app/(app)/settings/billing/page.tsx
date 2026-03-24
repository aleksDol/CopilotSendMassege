"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/common/loading-state";
import { EmptyState } from "@/components/common/empty-state";
import { useBillingSubscription, useBillingUsage } from "@/lib/hooks/use-app-data";

const SALES_URL = (process.env.NEXT_PUBLIC_SALES_TELEGRAM_URL ?? "").trim() || "https://t.me";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

export default function BillingSettingsPage() {
  const subscription = useBillingSubscription();
  const usage = useBillingUsage();
  const [error, setError] = useState<string | null>(null);

  const usagePct = useMemo(() => {
    if (!usage.data || usage.data.aiLimit <= 0) return 0;
    return Math.min(100, Math.round((usage.data.aiUsage / usage.data.aiLimit) * 100));
  }, [usage.data]);

  const trialDaysLeft = useMemo(() => {
    if (!subscription.data?.trialTimeLeftMs) return null;
    return Math.max(1, Math.ceil(subscription.data.trialTimeLeftMs / (24 * 60 * 60 * 1000)));
  }, [subscription.data?.trialTimeLeftMs]);

  if (subscription.isLoading || usage.isLoading) {
    return <LoadingState label="Загрузка оплаты..." />;
  }

  if (subscription.isError || usage.isError || !subscription.data || !usage.data) {
    return <EmptyState title="Оплата недоступна" description="Проверьте настройку Stripe в переменных окружения бэкенда." />;
  }

  const status = subscription.data.subscriptionStatus;
  const isTrialActive = status === "trial";
  const isTrialExpiring = isTrialActive && (trialDaysLeft ?? 999) <= 1;
  const isTrialExpired = status === "expired";
  const isPaidActive = status === "active";
  const isExpired = status === "expired" || status === "free";

  const planLabel = isTrialActive
    ? "Пробный период"
    : isPaidActive
      ? subscription.data.plan.toUpperCase()
      : isExpired
        ? "Пробный период завершён"
        : "Пробный период";
  const statusLabel = isTrialActive ? "trial" : isPaidActive ? "активна" : isExpired ? "expired" : "trial";
  const trialTimeLabel = trialDaysLeft ? `Осталось ${trialDaysLeft} ${trialDaysLeft === 1 ? "день" : "дня"}` : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Оплата</h1>
        <p className="text-sm text-muted-foreground">Подписка и лимиты использования ИИ.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Текущий тариф</CardTitle>
          <CardDescription>Статус доступа и текущий период.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Тариф: {planLabel}</Badge>
            <Badge variant={isPaidActive ? "success" : "warning"}>
              {statusLabel}
            </Badge>
            {subscription.data.cancelAtPeriodEnd ? <Badge variant="warning">отмена в конце периода</Badge> : null}
            {isTrialActive && trialTimeLabel ? <Badge variant={isTrialExpiring ? "warning" : "outline"}>{trialTimeLabel}</Badge> : null}
          </div>

          {isTrialActive ? (
            <div className={`rounded-lg border p-3 text-sm ${isTrialExpiring ? "border-warning/50 bg-warning/10" : "border-primary/20 bg-primary/5"}`}>
              <p className="font-medium">{isTrialExpiring ? "Пробный период скоро закончится" : "У вас пробный доступ"}</p>
              <p className="text-muted-foreground">
                {isTrialExpiring
                  ? "Чтобы продолжить работать без ограничений, подключите доступ."
                  : "Сейчас доступны все функции сервиса без ограничений."}
              </p>
            </div>
          ) : null}

          {isExpired ? (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
              <p className="font-medium">Пробный период завершён</p>
              <p className="text-muted-foreground">Данные и чаты сохранены. Чтобы продолжить полную работу, подключите доступ.</p>
            </div>
          ) : null}

          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            <div>Начало периода: {formatDate(subscription.data.currentPeriodStart)}</div>
            <div>Конец периода: {formatDate(subscription.data.currentPeriodEnd)}</div>
            <div>
              Подсказок ИИ в месяц: {isTrialActive ? "без ограничений в рамках trial" : subscription.data.limits.aiSuggestionsPerMonth}
            </div>
            <div>Участников в команде: {subscription.data.limits.maxUsers}</div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => window.open(SALES_URL, "_blank", "noopener,noreferrer")}
            >
              Перейти на Pro
            </Button>
            <Button
              variant="secondary"
              onClick={() => window.open(SALES_URL, "_blank", "noopener,noreferrer")}
            >
              Перейти на Team
            </Button>
            <Button
              variant="outline"
              onClick={() => window.open(SALES_URL, "_blank", "noopener,noreferrer")}
            >
              Управление подпиской
            </Button>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Использование ИИ</CardTitle>
          <CardDescription>
            {isTrialActive ? "Во время пробного периода доступны все ключевые AI-функции." : "Использование за месяц в рамках лимита тарифа."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            {isTrialActive ? `${usage.data.aiUsage} подсказок за период trial` : `${usage.data.aiUsage} / ${usage.data.aiLimit} подсказок (${usagePct}%)`}
          </div>
          {!isTrialActive ? (
            <div className="h-2 w-full rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${usagePct}%` }} />
            </div>
          ) : null}
          <div className="text-xs text-muted-foreground">Период до: {formatDate(usage.data.periodEnd)}</div>
          {!isTrialActive && usagePct >= 100 ? (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
              Лимит ИИ исчерпан. Смените тариф, чтобы продолжать генерировать подсказки.
            </div>
          ) : null}
          {isExpired ? (
            <div className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              Полный доступ можно включить через менеджера в Telegram.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
