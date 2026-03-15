"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/common/loading-state";
import { EmptyState } from "@/components/common/empty-state";
import { useBillingActions, useBillingSubscription, useBillingUsage } from "@/lib/hooks/use-app-data";

const formatDate = (value?: string | null) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
};

export default function BillingSettingsPage() {
  const subscription = useBillingSubscription();
  const usage = useBillingUsage();
  const actions = useBillingActions();
  const [error, setError] = useState<string | null>(null);

  const usagePct = useMemo(() => {
    if (!usage.data || usage.data.aiLimit <= 0) return 0;
    return Math.min(100, Math.round((usage.data.aiUsage / usage.data.aiLimit) * 100));
  }, [usage.data]);

  if (subscription.isLoading || usage.isLoading) {
    return <LoadingState label="Загрузка оплаты..." />;
  }

  if (subscription.isError || usage.isError || !subscription.data || !usage.data) {
    return <EmptyState title="Оплата недоступна" description="Проверьте настройку Stripe в переменных окружения бэкенда." />;
  }

  const plan = subscription.data.plan.toUpperCase();
  const statusLabel = subscription.data.status === "active" ? "активна" : subscription.data.status;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Оплата</h1>
        <p className="text-sm text-muted-foreground">Подписка и лимиты использования ИИ.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Текущий тариф</CardTitle>
          <CardDescription>Статус подписки и период продления.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">Тариф: {plan}</Badge>
            <Badge variant={subscription.data.status === "active" ? "success" : "warning"}>
              {statusLabel}
            </Badge>
            {subscription.data.cancelAtPeriodEnd ? <Badge variant="warning">отмена в конце периода</Badge> : null}
          </div>

          <div className="grid gap-2 text-sm text-muted-foreground md:grid-cols-2">
            <div>Начало периода: {formatDate(subscription.data.currentPeriodStart)}</div>
            <div>Конец периода: {formatDate(subscription.data.currentPeriodEnd)}</div>
            <div>Подсказок ИИ в месяц: {subscription.data.limits.aiSuggestionsPerMonth}</div>
            <div>Участников в команде: {subscription.data.limits.maxUsers}</div>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button
              variant="secondary"
              disabled={actions.checkout.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await actions.checkout.mutateAsync("pro");
                } catch (checkoutError) {
                  setError(checkoutError instanceof Error ? checkoutError.message : "Ошибка оформления подписки");
                }
              }}
            >
              Перейти на Pro
            </Button>
            <Button
              variant="secondary"
              disabled={actions.checkout.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await actions.checkout.mutateAsync("team");
                } catch (checkoutError) {
                  setError(checkoutError instanceof Error ? checkoutError.message : "Ошибка оформления подписки");
                }
              }}
            >
              Перейти на Team
            </Button>
            <Button
              variant="outline"
              disabled={actions.portal.isPending}
              onClick={async () => {
                setError(null);
                try {
                  await actions.portal.mutateAsync();
                } catch (portalError) {
                  setError(portalError instanceof Error ? portalError.message : "Ошибка портала оплаты");
                }
              }}
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
          <CardDescription>Использование за месяц в рамках лимита тарифа.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm">
            {usage.data.aiUsage} / {usage.data.aiLimit} подсказок ({usagePct}%)
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div className="h-2 rounded-full bg-primary" style={{ width: `${usagePct}%` }} />
          </div>
          <div className="text-xs text-muted-foreground">Период до: {formatDate(usage.data.periodEnd)}</div>
          {usagePct >= 100 ? (
            <div className="rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm text-warning-foreground">
              Лимит ИИ исчерпан. Смените тариф, чтобы продолжать генерировать подсказки.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
