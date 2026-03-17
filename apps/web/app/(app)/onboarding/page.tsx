"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TelegramConnectCard } from "@/components/settings/telegram-connect-card";
import { KnowledgeItemForm } from "@/components/settings/knowledge-item-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useKnowledgeItems, useSettingsActions, useTelegramAccount, useTelegramActions } from "@/lib/hooks/use-app-data";

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const telegram = useTelegramAccount();
  const telegramActions = useTelegramActions();
  const knowledge = useKnowledgeItems();
  const settingsActions = useSettingsActions();
  const [knowledgeError, setKnowledgeError] = useState<string | null>(null);

  const telegramConnected = (telegram.data?.loginStatus ?? telegram.data?.status) === "connected";
  const hasKnowledge = Boolean(knowledge.data?.items.length);

  const steps = useMemo(
    () => [
      { id: 1, title: "Подключить Telegram", done: telegramConnected },
      { id: 2, title: "База знаний", done: hasKnowledge },
      { id: 3, title: "Начать работу с входящими", done: false }
    ],
    [telegramConnected, hasKnowledge]
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Онбординг</h1>
        <p className="text-sm text-muted-foreground">Завершите настройку, чтобы начать работать с продажами в Telegram.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Прогресс</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          {steps.map((item) => (
            <button
              key={item.id}
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
                  К базе знаний
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
            <CardTitle>База знаний компании</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <KnowledgeItemForm
              submitLabel={settingsActions.createKnowledge.isPending ? "Сохранение..." : "Сохранить элемент"}
              disabled={settingsActions.createKnowledge.isPending}
              onSubmit={async (payload) => {
                setKnowledgeError(null);
                try {
                  await settingsActions.createKnowledge.mutateAsync(payload);
                } catch (error) {
                  setKnowledgeError(error instanceof Error ? error.message : "Не удалось сохранить");
                }
              }}
            />
            {knowledgeError ? <p className="text-sm text-destructive">{knowledgeError}</p> : null}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button variant="secondary" onClick={() => setStep(3)}>
                Далее
              </Button>
              <Button variant="ghost" onClick={() => setStep(3)}>
                Пропустить
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 3 ? (
        <Card>
          <CardHeader>
            <CardTitle>Всё готово</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Открывайте входящие, генерируйте подсказки ИИ и контролируйте follow-up.
            </p>
            <div className="flex flex-wrap gap-2">
              <Link href="/chats" className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">
                Чаты
              </Link>
              <Link href="/dashboard" className="rounded-md bg-secondary px-4 py-2 text-sm text-secondary-foreground">
                Дашборд
              </Link>
              <Link href="/settings/telegram" className="rounded-md border border-border px-4 py-2 text-sm">
                Настройки Telegram
              </Link>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
