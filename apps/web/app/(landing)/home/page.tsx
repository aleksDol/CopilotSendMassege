import type { Metadata } from "next";
import { TrackingLink } from "@/components/marketing/tracking-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChartColumn,
  MessageCircle,
  ShieldCheck,
  Sparkles,
  Smartphone,
  Target,
  Users
} from "lucide-react";

const baseUrl = process.env.APP_BASE_URL ?? process.env.NEXT_PUBLIC_APP_BASE_URL ?? "http://localhost:3000";
const canonicalUrl = `${baseUrl}/home`;

const baseButton =
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50";
const defaultMd = `${baseButton} h-10 px-4 py-2 bg-primary text-primary-foreground hover:brightness-110`;
const outlineMd = `${baseButton} h-10 px-4 py-2 border border-border bg-background hover:bg-muted`;
const defaultLg = `${baseButton} h-11 rounded-md px-8 bg-primary text-primary-foreground hover:brightness-110`;
const outlineLg = `${baseButton} h-11 rounded-md px-8 border border-border bg-background hover:bg-muted`;

export const metadata: Metadata = {
  title: "AI-помощник для продаж в Telegram",
  description:
    "Ведите все личные диалоги в одном месте, отвечайте быстрее с подсказками AI и не теряйте клиентов.",
  alternates: {
    canonical: canonicalUrl
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: canonicalUrl,
    title: "AI-помощник для продаж в Telegram",
    description:
      "Ведите все личные диалоги в одном месте, отвечайте быстрее с подсказками AI и не теряйте клиентов."
  },
  twitter: {
    card: "summary",
    title: "AI-помощник для продаж в Telegram",
    description:
      "Ведите все личные диалоги в одном месте, отвечайте быстрее с подсказками AI и не теряйте клиентов."
  }
};

function ScreenshotCard({
  src,
  title,
  details
}: {
  src: string;
  title: string;
  details: string;
}) {
  return (
    <div className="flex h-full flex-col justify-between rounded-xl border border-border bg-card p-5">
      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>

        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg border border-border bg-background/30 p-2">
          <img
            src={src}
            alt={title}
            loading="lazy"
            decoding="async"
            fetchPriority="low"
            className="absolute inset-0 h-full w-full object-contain p-2"
          />
        </div>
      </div>

      <div className="mt-4 text-xs text-muted-foreground">
        {details}
      </div>
    </div>
  );
}

export default function HomeLandingPage() {
  return (
    <div>
      <section className="relative">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div className="space-y-6">
              <div className="space-y-2">
                <span className="inline-flex w-fit items-center rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors">
                  AI Sales Assistant
                </span>
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  AI-помощник для продаж в Telegram
                </h1>
                <p className="text-base text-muted-foreground sm:text-lg">
                  Ведите все личные диалоги в одном месте, отвечайте быстрее с подсказками AI и не теряйте клиентов.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <TrackingLink href="/register" className={defaultMd}>
                  Зарегистрироваться
                </TrackingLink>
                <TrackingLink href="/login" className={outlineMd}>
                  Войти
                </TrackingLink>
              </div>

              <div className="text-sm text-muted-foreground">
                Хотите посмотреть, как это работает?{" "}
                <a href="#how-it-works" className="text-primary underline underline-offset-4 hover:brightness-110">
                  Перейдите к шагам
                </a>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="p-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <MessageCircle className="h-4 w-4 text-primary" />
                      Диалоги в одном месте
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                    Все личные чаты доступны из единого интерфейса.
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="p-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-4 w-4 text-primary" />
                      Подсказки AI для ответов
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4 pt-0 text-sm text-muted-foreground">
                    AI помогает подобрать формулировку с учетом контекста.
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm md:p-8">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-border">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Не теряйте лидов</h2>
                    <p className="text-sm text-muted-foreground">
                      Пропущенные ответы и забытые follow-up быстро подсветятся, чтобы диалоги не остывали.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Быстрее отвечаете
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">AI подсказывает, что написать клиенту.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Единый стиль общения
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Политика ответов задает правила и формат.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Следите за follow-up
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Задачи помогают не забывать про клиентов.</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Контроль переписок
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">Вся активность видна в дашборде.</p>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <Smartphone className="h-4 w-4 text-primary" />
                    Быстро в Telegram
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <Users className="h-4 w-4 text-primary" />
                    Для команд
                  </div>
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    Политика ответов
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Для кого</h2>
            <p className="text-sm text-muted-foreground">
              Подходит компаниям, которым важны скорость ответов и контроль переписок в Telegram.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {[
              { title: "Онлайн-школы", icon: Users, desc: "Обрабатывайте входящие заявки и отвечайте быстрее." },
              { title: "Агентства", icon: MessageCircle, desc: "Ведите несколько клиентов и не теряйте follow-up." },
              { title: "Эксперты", icon: Sparkles, desc: "Сохраняйте темп общения и единый стиль ответов." },
              {
                title: "Команды продаж в Telegram",
                icon: Target,
                desc: "Давайте менеджерам подсказки и контролируйте результат."
              }
            ].map((item) => (
              <Card key={item.title}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Какие проблемы решает</h2>
            <p className="text-sm text-muted-foreground">Убираем типичные боли продаж в личных чатах.</p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Что обычно идет не так</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Новые обращения теряются",
                  "Менеджеры отвечают слишком долго",
                  "Follow-up забываются",
                  "Нет единого стандарта ответов",
                  "Сложно контролировать переписки"
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                      !
                    </span>
                    <p className="text-muted-foreground">{t}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base">Как продукт помогает</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Единый интерфейс для всех личных чатов в Telegram",
                  "AI-подсказки, что ответить клиенту с учетом контекста",
                  "Задачи и follow-up, чтобы ничего не было пропущено",
                  "Политика ответов — контроль стиля и правил общения",
                  "Дашборд и контроль входящих диалогов"
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-muted-foreground">{t}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-24 border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Как это работает</h2>
            <p className="text-sm text-muted-foreground">
              Быстрый путь от подключения Telegram до удобной работы с диалогами и результатом.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              { step: 1, title: "Подключаете Telegram", desc: "Задаёте источник входящих диалогов и запускаете синхронизацию." },
              { step: 2, title: "Видите чаты в одном интерфейсе", desc: "Все личные диалоги — в едином списке и окне диалога." },
              { step: 3, title: "Используете AI-подсказки", desc: "AI предлагает вариант ответа и помогает быстрее формулировать сообщение." },
              { step: 4, title: "Следите за задачами и follow-up", desc: "Система показывает, где нужно ответить и когда написать повторно." },
              { step: 5, title: "Управляете диалогами быстрее", desc: "Снижаете ручную рутину и доводите клиентов до результата." }
            ].map((s) => (
              <Card key={s.step} className="h-full">
                <CardContent className="p-5">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                      {s.step}
                    </span>
                    <h3 className="text-base font-semibold">{s.title}</h3>
                  </div>
                  <p className="mt-3 text-sm text-muted-foreground">{s.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Основные функции</h2>
            <p className="text-sm text-muted-foreground">Ключевые возможности для работы в Telegram.</p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { title: "Все личные чаты в одном месте", icon: MessageCircle, desc: "Не нужно переключаться между окнами и источниками переписок." },
              { title: "AI-подсказки ответов", icon: Bot, desc: "Сокращайте время на черновики и улучшайте качество формулировок." },
              { title: "Follow-up и задачи", icon: Target, desc: "Система подсказывает, кому нужно ответить и что написать повторно." },
              { title: "Дашборд с метриками", icon: ChartColumn, desc: "Отслеживайте активность и динамику по диалогам и лидам." },
              { title: "База знаний компании", icon: BookOpen, desc: "FAQ, цены и правила — для точных ответов AI." },
              { title: "Политика ответов", icon: ShieldCheck, desc: "Единый стиль общения и ограничения для AI." }
            ].map((f) => (
              <Card key={f.title}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <f.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{f.title}</h3>
                      <p className="text-sm text-muted-foreground">{f.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Интерфейс продукта</h2>
            <p className="text-sm text-muted-foreground">
              Ниже — легкие заглушки под скриншоты. Позже вы сможете заменить их на реальные изображения.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <ScreenshotCard
              src="/landing/screenshot-chats-overview.png"
              title="Список чатов и активный диалог"
              details="Скриншот списка чатов и активного диалога в интерфейсе."
            />
            <ScreenshotCard
              src="/landing/screenshot-ai-suggestion-panel.png"
              title="AI-подсказка ответа в чате"
              details="Скриншот панели с AI-подсказкой: варианты ответа и действия (принять/редактировать)."
            />
            <ScreenshotCard
              src="/landing/screenshot-dashboard-metrics.png"
              title="Дашборд с ключевыми метриками"
              details="Скриншот дашборда: активные диалоги, ожидают ответа, follow-up и другие метрики."
            />
            <ScreenshotCard
              src="/landing/screenshot-tasks-followup.png"
              title="Задачи и follow-up"
              details="Скриншот задач: что требует ответа и какие follow-up нужно выполнить."
            />
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Почему это выгодно</h2>
            <p className="text-sm text-muted-foreground">Результат — в скорости и контроле диалогов.</p>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Что вы получаете</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Быстрее отвечаете клиентам",
                  "Не забываете про лидов",
                  "Меньше ручной рутины",
                  "Удобнее вести продажи в Telegram",
                  "AI помогает сохранять единый стиль общения"
                ].map((t) => (
                  <div key={t} className="flex items-start gap-2 text-sm">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                    <p className="text-muted-foreground">{t}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="space-y-3">
            <h2 className="text-2xl font-semibold">Начать просто</h2>
            <p className="text-sm text-muted-foreground">
              Зарегистрируйтесь и выполните 4 коротких шага, чтобы начать работать с чатами в Telegram.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            {[
              { title: "Зарегистрироваться", icon: Sparkles, desc: "Создайте аккаунт и получите доступ к рабочему пространству." },
              { title: "Подключить Telegram", icon: Smartphone, desc: "Синхронизируйте диалоги, чтобы они появились в интерфейсе." },
              { title: "Добавить базу знаний", icon: BookOpen, desc: "FAQ, цены и правила помогают AI отвечать точнее." },
              { title: "Начать работать с чатами", icon: MessageCircle, desc: "Просматривайте личные диалоги в одном месте и отвечайте быстрее." }
            ].map((s) => (
              <Card key={s.title}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary ring-1 ring-primary/20">
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold">{s.title}</h3>
                      <p className="text-sm text-muted-foreground">{s.desc}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
            <TrackingLink href="/register" className={defaultLg}>
              Зарегистрироваться
            </TrackingLink>
            <TrackingLink href="/login" className={outlineLg}>
              Войти
            </TrackingLink>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="rounded-2xl border border-border bg-card p-6 md:p-10">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Начните работать с клиентами в Telegram удобнее</h2>
                <p className="text-sm text-muted-foreground">
                  Зарегистрируйтесь, подключите Telegram, добавьте базу знаний и начните отвечать быстрее с подсказками AI.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
                <TrackingLink href="/register" className={defaultLg}>
                  Зарегистрироваться
                </TrackingLink>
                <TrackingLink href="/login" className={outlineLg}>
                  Войти
                </TrackingLink>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground">
            AI Sales Assistant для Telegram — единый интерфейс для диалогов и помощник для ответов.
          </div>
        </div>
      </section>
    </div>
  );
}

