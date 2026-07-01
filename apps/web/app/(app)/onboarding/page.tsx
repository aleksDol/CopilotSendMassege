"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TelegramConnectCard } from "@/components/settings/telegram-connect-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  useLeadRadarKeywords,
  useLeadRadarSources,
  useTelegramAccount,
  useTelegramAccounts,
  useTelegramActions
} from "@/lib/hooks/use-app-data";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const telegram = useTelegramAccount();
  const telegramAccounts = useTelegramAccounts();
  const telegramActions = useTelegramActions();
  const keywords = useLeadRadarKeywords();
  const sources = useLeadRadarSources();

  const telegramConnected = (telegram.data?.loginStatus ?? telegram.data?.status) === "connected";
  const hasParsingAccount = Boolean(
    telegramAccounts.data?.items?.some((account) => account.channelAccountId && account.parsingEnabled !== false)
  );
  const hasKeywords = Boolean(keywords.data?.items?.length);
  const hasSources = Boolean(sources.data?.items?.length);
  const leadRadarStarted = hasKeywords || hasSources;

  const steps = useMemo(
    () => [
      { id: 1, title: "Подключите рабочий Telegram", done: telegramConnected && hasParsingAccount },
      { id: 2, title: "Опишите бизнес", done: hasKeywords },
      { id: 3, title: "Начните поиск клиентов", done: hasSources }
    ],
    [telegramConnected, hasParsingAccount, hasKeywords, hasSources]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Первые шаги</h1>
        <p className="text-sm text-muted-foreground">
          Вход через Telegram — только для доступа к сервису. Для поиска клиентов подключите рабочий аккаунт отдельно.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Прогресс</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          {steps.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-lg border px-3 py-2 text-left ${step === item.id ? "border-primary bg-primary/10" : "border-border"}`}
              onClick={() => setStep(item.id)}
            >
              <div className="text-xs text-muted-foreground">Шаг {item.id}</div>
              <div className="font-medium">{item.title}</div>
              <div className="text-xs text-muted-foreground">{item.done ? "Выполнено" : "Ожидает"}</div>
            </button>
          ))}
        </CardContent>
      </Card>

      {step === 1 ? (
        <>
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="space-y-2 pt-6 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Вход в SaaS</span> — через Telegram-бота.{" "}
                <span className="font-medium text-foreground">Рабочий аккаунт</span> — для чтения чатов и поиска лидов в
                LeadRadar. Это разные подключения.
              </p>
              <p>После QR-входа включите «Парсинг» в настройках Telegram, чтобы LeadRadar мог искать клиентов.</p>
            </CardContent>
          </Card>

          <TelegramConnectCard
            account={telegram.data}
            loading={
              telegramActions.startConnectQr.isPending ||
              telegramActions.pollLoginQr.isPending ||
              telegramActions.verifyPasswordQr.isPending ||
              telegramActions.sync.isPending ||
              telegramActions.logout.isPending
            }
            onStartQr={() => telegramActions.startConnectQr.mutateAsync()}
            onPollQr={(qrSessionId) => telegramActions.pollLoginQr.mutateAsync(qrSessionId)}
            onVerifyPasswordQr={(payload) => telegramActions.verifyPasswordQr.mutateAsync(payload)}
            onSync={async () => {
              await telegramActions.sync.mutateAsync();
            }}
            onLogout={async () => {
              await telegramActions.logout.mutateAsync();
            }}
          />

          <Card>
            <CardContent className="pt-6">
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="secondary"
                  disabled={!telegramConnected}
                  onClick={() => {
                    setStep(2);
                  }}
                >
                  Далее: описать бизнес
                </Button>
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Пропустить
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      ) : null}

      {step === 2 ? (
        <Card>
          <CardHeader>
            <CardTitle>Опишите бизнес</CardTitle>
            <CardDescription>
              ИИ подберёт поисковые фразы и тематики чатов для LeadRadar. Это займёт пару минут.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Расскажите, чем вы занимаетесь и кому продаёте — на следующем экране вы выберете фразы и подключите
              источники.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/leadradar/setup" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                Настроить поиск клиентов
              </Link>
              <Button variant="ghost" onClick={() => setStep(3)}>
                Пропустить
              </Button>
            </div>
            {hasKeywords ? (
              <p className="text-sm text-emerald-700 dark:text-emerald-400">Поисковые фразы уже добавлены.</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Начните поиск клиентов</CardTitle>
            <CardDescription>Выберите Telegram-сообщества и запустите мониторинг.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {leadRadarStarted
                ? "LeadRadar настроен. Откройте раздел лидов или подключите дополнительные источники."
                : "Сначала завершите AI-настройку, затем выберите источники в маркетплейсе."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/leadradar/marketplace" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                Выбрать источники
              </Link>
              <Link href="/leadradar" className="rounded-md bg-secondary px-4 py-2 text-sm text-secondary-foreground">
                Открыть лиды
              </Link>
              <Link href="/dashboard" className="rounded-md border border-border px-4 py-2 text-sm">
                Перейти к обзору
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
