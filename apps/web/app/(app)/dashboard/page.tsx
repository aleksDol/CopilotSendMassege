"use client";

import Link from "next/link";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { MetricCard } from "@/components/dashboard/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboardOverview } from "@/lib/hooks/use-app-data";

export default function DashboardPage() {
  const overview = useDashboardOverview();

  if (overview.isLoading) {
    return <LoadingState label="Загрузка метрик дашборда..." />;
  }

  if (!overview.data) {
    return <EmptyState title="Пока нет данных" description="Подключите Telegram и синхронизируйте чаты, чтобы заполнить дашборд." />;
  }

  const m = overview.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Дашборд</h1>
        <p className="text-sm text-muted-foreground">Обзор по вашему рабочему пространству продаж.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Активные диалоги" value={m.activeConversations} />
        <MetricCard title="Ожидают ответа" value={m.waitingForReply} />
        <MetricCard title="Просроченные follow-up" value={m.overdueFollowUps} />
        <MetricCard title="Новые лиды" value={m.newLeads} />
        <MetricCard title="Выигранные лиды" value={m.wonLeads} />
        <MetricCard title="Потерянные лиды" value={m.lostLeads} />
        <MetricCard title="Сгенерировано подсказок" value={m.suggestionsGenerated} />
        <MetricCard title="Принято подсказок" value={m.suggestionsAccepted} />
        <MetricCard title="Доля принятых" value={`${Math.round(m.acceptanceRate * 100)}%`} />
        <MetricCard title="Ср. время ответа" value={`${Math.round(m.avgReplyTimeSeconds / 60)} мин`} />
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
