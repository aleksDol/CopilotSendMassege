"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Briefcase,
  Building2,
  Car,
  Check,
  Hammer,
  Layers,
  Megaphone,
  Sparkles,
  type LucideIcon
} from "lucide-react";
import { ApiError } from "@/lib/api/errors";
import { sourceMarketplaceApi, type SourceMarketplaceRecommendationItem, type SourceMarketplaceSubscribeRunResponse } from "@/lib/api/source-marketplace";
import { useAuth } from "@/lib/auth/context";
import { useSelectedLeadRadarParsingChannelAccountId } from "@/lib/hooks/use-app-data";
import { readMarketplaceSetupContext } from "@/lib/leadradar/marketplace-setup-context";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils/cn";

const ICON_MAP: Record<string, LucideIcon> = {
  briefcase: Briefcase,
  building: Building2,
  building2: Building2,
  car: Car,
  hammer: Hammer,
  megaphone: Megaphone,
  layers: Layers,
  marketing: Megaphone,
  business: Briefcase
};

function TopicIcon({ icon, name, color }: { icon: string; name: string; color: string }) {
  const normalized = icon.trim().toLowerCase();
  const Lucide = ICON_MAP[normalized];
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
      style={{ backgroundColor: color || "#6366f1" }}
      aria-hidden
    >
      {Lucide ? <Lucide className="h-6 w-6" /> : <span className="text-lg font-semibold">{initial}</span>}
    </div>
  );
}

function formatSourceCount(count: number): string {
  if (count <= 0) return "~0 источников";
  if (count === 1) return "~1 источник";
  if (count >= 2 && count <= 4) return `~${count} источника`;
  return `~${count} источников`;
}

function TopicCard({
  topic,
  selected,
  onToggle
}: {
  topic: SourceMarketplaceRecommendationItem;
  selected: boolean;
  onToggle: (checked: boolean) => void;
}) {
  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onToggle(!selected)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onToggle(!selected);
        }
      }}
      className={cn(
        "group relative flex h-full w-full cursor-pointer flex-col rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30"
          : "border-border bg-background hover:border-primary/40 hover:bg-muted/30"
      )}
    >
      <div className="absolute right-3 top-3" onClick={(event) => event.stopPropagation()} onKeyDown={(event) => event.stopPropagation()}>
        <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Выбрать ${topic.name}`} />
      </div>

      <div className="flex items-start gap-3 pr-8">
        <TopicIcon icon={topic.icon} name={topic.name} color={topic.color} />
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold leading-tight">{topic.name}</h3>
            {topic.recommended ? (
              <Badge variant="success" className="shrink-0">
                Рекомендуем
              </Badge>
            ) : null}
          </div>
          {topic.description ? (
            <p className="text-sm leading-relaxed text-muted-foreground">{topic.description}</p>
          ) : null}
          <p className="text-xs font-medium text-muted-foreground">{formatSourceCount(topic.sourceCount)}</p>
        </div>
      </div>
    </article>
  );
}

export default function LeadRadarMarketplacePage() {
  const { token } = useAuth();
  const { selectedLeadRadarParsingChannelAccountId } = useSelectedLeadRadarParsingChannelAccountId();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<SourceMarketplaceRecommendationItem[]>([]);
  const [hasRecommendations, setHasRecommendations] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [run, setRun] = useState<SourceMarketplaceSubscribeRunResponse | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const setupContext = useMemo(() => readMarketplaceSetupContext(), []);
  const keywordCount = setupContext.keywordCount;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await sourceMarketplaceApi.getRecommendations(token, setupContext.chatTopics);
      setItems(res.items);
      setHasRecommendations(res.hasRecommendations);
      const preselected = new Set(res.items.filter((item) => item.recommended).map((item) => item.id));
      setSelectedIds(preselected);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось загрузить тематики");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [token, setupContext.chatTopics]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedCount = selectedIds.size;
  const isRunActive = run?.status === "running" || run?.status === "pending";
  const canStart =
    selectedCount > 0 && Boolean(selectedLeadRadarParsingChannelAccountId) && !starting && !isRunActive;

  const handleToggle = (id: string, checked: boolean) => {
    if (isRunActive) return;
    setStartError(null);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleStartSearch = async () => {
    if (!token || !selectedLeadRadarParsingChannelAccountId || selectedIds.size === 0) return;
    setStarting(true);
    setStartError(null);
    try {
      const created = await sourceMarketplaceApi.startSubscribe(token, {
        topicIds: [...selectedIds],
        channelAccountId: selectedLeadRadarParsingChannelAccountId
      });
      setRun(created);
    } catch (e) {
      setStartError(e instanceof ApiError ? e.message : "Не удалось запустить подключение источников");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    if (!token || !run?.id || (run.status !== "running" && run.status !== "pending")) {
      return;
    }

    const poll = async () => {
      try {
        const next = await sourceMarketplaceApi.getSubscribeRun(token, run.id);
        setRun(next);
      } catch {
        // keep last known run state on transient poll errors
      }
    };

    const interval = window.setInterval(() => {
      void poll();
    }, 5000);

    return () => window.clearInterval(interval);
  }, [token, run?.id, run?.status]);

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold">Мы всё подготовили</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          LeadRadar настроен — осталось выбрать, из каких Telegram-сообществ искать клиентов.
        </p>
        <LeadRadarNav />
      </div>

      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 via-background to-background">
        <CardContent className="space-y-4 p-6">
          <p className="text-sm font-medium text-foreground">Подготовлено:</p>
          <ul className="space-y-2 text-sm">
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <span>
                {keywordCount > 0
                  ? `${keywordCount} ${keywordCount === 1 ? "поисковая фраза" : keywordCount < 5 ? "поисковые фразы" : "поисковых фраз"}`
                  : "Поисковые фразы сохранены"}
              </span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
              <span>{hasRecommendations ? "Найдены подходящие источники" : "Доступны тематики источников"}</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {run ? (
        <Card className="border-primary/30">
          <CardContent className="space-y-4 p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">Подключаем источники</h2>
              {run.activeCount > 0 ? (
                <p className="text-sm text-foreground">
                  Уже ищем клиентов в {run.activeCount}{" "}
                  {run.activeCount === 1 ? "источнике" : run.activeCount < 5 ? "источниках" : "источниках"}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Подготавливаем подключение источников…</p>
              )}
              <p className="text-xs text-muted-foreground">
                Можно закрыть страницу — подключение продолжится в фоне
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {run.joinedCount + run.skippedCount + run.failedCount} / {run.totalCount + run.skippedCount}
                </span>
                <span>{run.percent}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-500"
                  style={{ width: `${run.percent}%` }}
                />
              </div>
            </div>

            {run.status === "completed" ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400" role="status">
                {run.totalCount === 0
                  ? "Все выбранные источники уже подключены."
                  : "Подключение завершено."}
              </p>
            ) : null}

            {run.status === "failed" && run.lastError ? (
              <p className="text-sm text-destructive" role="alert">
                {run.lastError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {loading ? <LoadingState label="Подбираем тематики..." /> : null}

      {error ? <EmptyState title="Не удалось загрузить тематики" description={error} /> : null}

      {!loading && !error && items.length === 0 ? (
        <EmptyState
          title="Тематики пока не опубликованы"
          description="Администратор ещё не добавил активные тематики в каталог источников."
        />
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <section className={cn("space-y-3", isRunActive && "pointer-events-none opacity-60")}>
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Выберите тематики</h2>
              <p className="text-sm text-muted-foreground">
                {hasRecommendations
                  ? "Рекомендованные тематики уже выбраны — можно изменить выбор."
                  : "Покажем все доступные тематики — выберите подходящие."}
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Выбрано: {selectedCount}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((topic) => (
              <TopicCard
                key={topic.id}
                topic={topic}
                selected={selectedIds.has(topic.id)}
                onToggle={(checked) => handleToggle(topic.id, checked)}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div className="sticky bottom-0 -mx-1 border-t border-border bg-background/95 px-1 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3">
          {!selectedLeadRadarParsingChannelAccountId ? (
            <p className="text-sm text-destructive">
              Выберите аккаунт для парсинга в настройках LeadRadar перед запуском.
            </p>
          ) : null}
          {startError ? (
            <p className="text-sm text-destructive" role="alert">
              {startError}
            </p>
          ) : null}
          <Button
            size="lg"
            className="w-full sm:w-auto"
            disabled={!canStart}
            onClick={() => void handleStartSearch()}
          >
            {starting ? "Запускаем…" : isRunActive ? "Подключение запущено" : "Начать поиск клиентов"}
          </Button>
        </div>
      </div>
    </div>
  );
}
