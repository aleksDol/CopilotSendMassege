import Link from "next/link";
import {
  BookOpen,
  Bot,
  ChartColumn,
  CheckSquare,
  CircleCheckBig,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Smartphone
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const startSteps = [
  {
    title: "Подключите Telegram",
    description:
      "Подключите свой рабочий Telegram-аккаунт, чтобы видеть все диалоги в системе."
  },
  {
    title: "Заполните базу знаний",
    description:
      "Добавьте информацию о компании, ценах, FAQ и условиях работы. Это нужно, чтобы AI давал точные ответы."
  },
  {
    title: "Откройте раздел «Чаты»",
    description: "Здесь вы увидите все входящие диалоги с клиентами."
  },
  {
    title: "Используйте AI-подсказки",
    description:
      "Система предложит, что можно ответить клиенту: как вести диалог, отработать возражение или сгенерировать другой вариант."
  },
  {
    title: "Следите за задачами",
    description:
      "Система подскажет, где вы не ответили и где нужно сделать follow-up."
  }
];

const featureCards = [
  {
    title: "Чаты",
    description:
      "Все личные диалоги в одном месте. Больше не нужно переключаться между окнами.",
    icon: MessageCircle
  },
  {
    title: "AI-помощник",
    description:
      "Подсказывает, что написать клиенту: отвечает на вопросы, помогает продавать и учитывает контекст диалога.",
    icon: Bot
  },
  {
    title: "Задачи",
    description:
      "Система отслеживает, кому вы не ответили, где клиент «завис» и где нужно написать повторно.",
    icon: CheckSquare
  },
  {
    title: "Дашборд",
    description:
      "Общая картина: сколько диалогов, сколько требуют ответа и какая активность сейчас в работе.",
    icon: ChartColumn
  },
  {
    title: "База знаний",
    description:
      "Хранит FAQ, цены, правила и описание продукта. AI использует эти данные для ответов.",
    icon: BookOpen
  },
  {
    title: "Политика ответов",
    description:
      "Вы задаёте стиль общения, ограничения и правила, чтобы AI отвечал так, как нужно вам.",
    icon: ShieldCheck
  }
];

const valuePoints = [
  "Не терять клиентов.",
  "Быстрее отвечать.",
  "Держать все диалоги под контролем.",
  "Не забывать про follow-up.",
  "Стандартизировать ответы.",
  "Разгрузить менеджеров."
];

const tips = [
  "Сначала подключите Telegram.",
  "Добавьте базовую информацию о компании.",
  "Начните с реальных диалогов.",
  "Используйте AI как помощника, а не автопилот.",
  "Обращайте внимание на чаты с пометкой «ждёт ответа»."
];

export default function GettingStartedPage() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 md:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="space-y-3">
          <Badge variant="secondary" className="w-fit">
            Onboarding
          </Badge>
          <div>
            <h1 className="text-2xl font-semibold">Начало работы</h1>
            <p className="text-sm text-muted-foreground">
              Всё, что нужно, чтобы начать работать с клиентами в Telegram быстрее и эффективнее.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Что это за сервис</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Этот сервис помогает вести продажи и общение с клиентами в Telegram в одном удобном интерфейсе.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Все личные чаты в одном месте.</div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Подсказки от AI, что ответить клиенту.</div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Контроль над диалогами и лидами.</div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Напоминания, кому нужно ответить.</div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-medium">
              Это не просто чат, а инструмент для продаж.
            </div>
            <p className="text-xs text-muted-foreground">
              Документы:{" "}
              <Link href="/offer" className="text-primary underline-offset-2 hover:underline">
                оферта
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-primary underline-offset-2 hover:underline">
                конфиденциальность
              </Link>
              ,{" "}
              <Link href="/personal-data" className="text-primary underline-offset-2 hover:underline">
                персональные данные
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Как начать</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {startSteps.map((step, index) => (
              <div key={step.title} className="rounded-lg border border-border bg-card p-4">
                <div className="mb-2 flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                    {index + 1}
                  </span>
                  <p className="font-medium">{step.title}</p>
                </div>
                <p className="text-sm text-muted-foreground">{step.description}</p>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Основные возможности</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {featureCards.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="rounded-lg border border-border bg-card p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{feature.title}</p>
                  </div>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Почему это удобно</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {valuePoints.map((point) => (
                <div key={point} className="flex items-start gap-2 text-sm">
                  <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-muted-foreground">{point}</p>
                </div>
              ))}
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-medium">
                В итоге — больше закрытых сделок и меньше потерь.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Советы</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {tips.map((tip) => (
                <div key={tip} className="flex items-start gap-2 text-sm">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <p className="text-muted-foreground">{tip}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Быстрые действия</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href="/settings/telegram"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110"
            >
              <Smartphone className="h-4 w-4" />
              Подключить Telegram
            </Link>
            <Link
              href="/chats"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <MessageCircle className="h-4 w-4" />
              Открыть чаты
            </Link>
            <Link
              href="/settings/ai-brain"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <BookOpen className="h-4 w-4" />
              Заполнить базу знаний
            </Link>
            <Link
              href="/settings/ai-brain"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ShieldCheck className="h-4 w-4" />
              Настроить политику ответов
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
