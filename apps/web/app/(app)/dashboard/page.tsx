"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { TrialPaywallCard } from "@/components/billing/trial-paywall-card";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useAuth } from "@/lib/auth/context";
import { useDashboardSales } from "@/lib/hooks/use-app-data";
import type { SalesDashboardPeriod } from "@/lib/api/types";

export default function DashboardPage() {
  const { access } = useAuth();
  const [period, setPeriod] = useState<SalesDashboardPeriod>("week");
  const sales = useDashboardSales(period);

  const periodLabel = useMemo(() => {
    if (period === "day") return "День";
    if (period === "week") return "Неделя";
    return "Месяц";
  }, [period]);

  if (sales.isLoading) {
    return <LoadingState label="Загрузка метрик дашборда..." />;
  }

  if (!sales.data) {
    return <EmptyState title="Пока нет данных" description="Подключите Telegram и синхронизируйте чаты, чтобы заполнить дашборд." />;
  }

  const m = sales.data.metrics;
  const comparisonText = sales.data.comparisonLabelRu;

  return (
    <div className="space-y-6">
      {access?.subscriptionStatus === "expired" ? <TrialPaywallCard /> : null}
      <div>
        <h1 className="text-2xl font-semibold">Дашборд</h1>
        <p className="text-sm text-muted-foreground">Обзор по вашему рабочему пространству продаж.</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select
            aria-label="Период"
            value={period}
            onChange={(e) => setPeriod(e.target.value as SalesDashboardPeriod)}
            options={[
              { label: "День", value: "day" },
              { label: "Неделя", value: "week" },
              { label: "Месяц", value: "month" }
            ]}
          />
        </div>
        <div className="text-sm text-muted-foreground">
          Период: <span className="font-medium text-foreground">{periodLabel}</span>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title={m.newLeads.label}
          value={m.newLeads.value}
          deltaLabel={m.newLeads.deltaLabel}
          deltaDirection={m.newLeads.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.avgResponseTimeMinutes.label}
          value={`${m.avgResponseTimeMinutes.value} мин`}
          deltaLabel={m.avgResponseTimeMinutes.deltaLabel}
          deltaDirection={m.avgResponseTimeMinutes.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.repliedCount.label}
          value={m.repliedCount.value}
          deltaLabel={m.repliedCount.deltaLabel}
          deltaDirection={m.repliedCount.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.ignoredCount.label}
          value={m.ignoredCount.value}
          deltaLabel={m.ignoredCount.deltaLabel}
          deltaDirection={m.ignoredCount.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.generatedSuggestions.label}
          value={m.generatedSuggestions.value}
          deltaLabel={m.generatedSuggestions.deltaLabel}
          deltaDirection={m.generatedSuggestions.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.wonCount.label}
          value={m.wonCount.value}
          deltaLabel={m.wonCount.deltaLabel}
          deltaDirection={m.wonCount.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.leadToReplyRate.label}
          value={`${m.leadToReplyRate.value}%`}
          deltaLabel={m.leadToReplyRate.deltaLabel}
          deltaDirection={m.leadToReplyRate.direction}
          comparisonText={comparisonText}
        />
        <MetricCard
          title={m.replyToWonRate.label}
          value={`${m.replyToWonRate.value}%`}
          deltaLabel={m.replyToWonRate.deltaLabel}
          deltaDirection={m.replyToWonRate.direction}
          comparisonText={comparisonText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Быстрые ссылки</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Link href="/chats?waitingForReply=true" className="rounded-md bg-secondary px-3 py-2 text-sm">
            Чаты, ожидающие ответа
          </Link>
          <Link href="/tasks?status=open" className="rounded-md bg-secondary px-3 py-2 text-sm">
            Просроченные задачи
          </Link>
          <Link href="/settings/telegram" className="rounded-md bg-secondary px-3 py-2 text-sm">
            Подключение Telegram
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
