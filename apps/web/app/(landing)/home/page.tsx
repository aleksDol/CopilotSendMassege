import type { Metadata } from "next";
import Image from "next/image";
import { TrackingLink } from "@/components/marketing/tracking-link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BookOpen,
  Bot,
  CheckCircle2,
  ChartColumn,
  Inbox,
  MessageCircle,
  Search,
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
  title: "AI Sales Assistant для Telegram — ответы + поиск лидов",
  description:
    "Обрабатывайте входящие диалоги быстрее с AI-подсказками и находите новых потенциальных клиентов в чатах и комментариях через LeadRadar.",
  alternates: {
    canonical: canonicalUrl
  },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    url: canonicalUrl,
    title: "AI Sales Assistant для Telegram — ответы + поиск лидов",
    description:
      "Обрабатывайте входящие диалоги быстрее с AI-подсказками и находите новых потенциальных клиентов в чатах и комментариях через LeadRadar."
  },
  twitter: {
    card: "summary",
    title: "AI Sales Assistant для Telegram — ответы + поиск лидов",
    description:
      "Обрабатывайте входящие диалоги быстрее с AI-подсказками и находите новых потенциальных клиентов в чатах и комментариях через LeadRadar."
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
          <Image src={src} alt={title} fill className="object-contain p-2" sizes="(max-width: 768px) 100vw, 50vw" />
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
                  AI Sales Assistant for Telegram
                </span>
                <h1 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl lg:text-5xl">
                  Не упускайте входящие запросы и находите новые возможности в Telegram
                </h1>
                <p className="text-base text-muted-foreground sm:text-lg">
                  AI Copilot помогает отвечать быстрее в переписке, а LeadRadar — находить потенциальных клиентов в чатах и комментариях каналов, где вы уже состоите.
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

              <p className="text-xs text-muted-foreground">
                Бесплатный старт: регистрация → подключение Telegram → первые подсказки и первые лиды из ваших источников.
              </p>
            </div>

            <div className="relative">
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-6 shadow-sm md:p-8">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-background ring-1 ring-border">
                    <Target className="h-5 w-5 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold">Два источника роста в одном сервисе</h2>
                    <p className="text-sm text-muted-foreground">
                      Входящие диалоги — под контролем. Параллельно — поиск новых людей, которым уже может быть нужна ваша услуга.
                    </p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Bot className="h-4 w-4 text-primary" />
                      AI Copilot
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Подсказки ответа с учетом контекста. AI ничего не отправляет сам — вы контролируете сообщение.
                    </p>
                  </div>
                  <div className="rounded-xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Search className="h-4 w-4 text-primary" />
                      LeadRadar
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Мониторит выбранные чаты и комментарии каналов, где вы состоите, и находит потенциальных клиентов по сигналам.
                    </p>
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
                  <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs text-muted-foreground">
                    <Inbox className="h-4 w-4 text-primary" />
                    Inbox лидов
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-12 md:px-8 md:py-16">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Сценарий 1: входящие под контролем</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Вы ведете переписку в одном интерфейсе и отвечаете быстрее, когда AI предлагает черновик ответа по контексту диалога.
                </p>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-muted-foreground">AI предлагает — вы отправляете. Никаких автосообщений.</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-primary/5">
              <CardHeader>
                <CardTitle className="text-base">Сценарий 2: новые лиды из Telegram</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Добавляете чаты, группы и комментарии каналов как источники — LeadRadar отслеживает новые сообщения и подсвечивает людей с релевантным запросом.
                </p>
                <div className="flex items-start gap-2 text-sm">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-muted-foreground">Работает только в источниках, где вы уже состоите.</p>
                </div>
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
              Простой путь: входящие → подсказки → источники → лиды → диалог.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {[
              { step: 1, title: "Подключаете Telegram", desc: "Подключаете аккаунт и получаете единый интерфейс для переписки." },
              { step: 2, title: "Отвечаете быстрее", desc: "AI Copilot предлагает черновик ответа по контексту — вы решаете, что отправить." },
              { step: 3, title: "Добавляете источники", desc: "Выбираете чаты/группы и комментарии каналов, где вы уже состоите." },
              { step: 4, title: "Находите лидов", desc: "LeadRadar подсвечивает сообщения с потенциальным спросом и сохраняет лидов в inbox." },
              { step: 5, title: "Переводите в диалог", desc: "Быстро переходите к контакту и ведете коммуникацию в одном месте." }
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
          <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold">LeadRadar — поиск лидов без “серых” обещаний</h2>
              <p className="text-sm text-muted-foreground">
                Вы выбираете источники (чаты, группы и комментарии каналов), где вы уже состоите. Мы не “парсим весь Telegram” и не занимаемся спамом.
              </p>
            </div>
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="space-y-3 p-6">
                {[
                  { title: "Мониторинг источников", desc: "Отслеживаем новые сообщения в ваших выбранных чатах и комментариях." },
                  { title: "Сигналы спроса", desc: "Подсвечиваем сообщения по ключевым фразам и intent-сигналам." },
                  { title: "Inbox лидов", desc: "Сохраняем найденных лидов в мини-CRM, чтобы не потерять и быстро обработать." },
                  { title: "Быстрый переход к контакту", desc: "Переводите лид в диалог и ведите коммуникацию внутри продукта." }
                ].map((i) => (
                  <div key={i.title} className="rounded-xl border border-border bg-card p-4">
                    <div className="text-sm font-medium">{i.title}</div>
                    <div className="mt-1 text-sm text-muted-foreground">{i.desc}</div>
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
            <h2 className="text-2xl font-semibold">Интерфейс продукта</h2>
            <p className="text-sm text-muted-foreground">Пара экранов, чтобы быстро понять, как выглядит продукт.</p>
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
            <h2 className="text-2xl font-semibold">Результат для продаж</h2>
            <p className="text-sm text-muted-foreground">Фокус на итог: меньше потерь, больше релевантных диалогов.</p>
          </div>

          <div className="mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Что меняется в работе</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {[
                  "Быстрее ответы и меньше “зависших” диалогов",
                  "Меньше потерянных лидов — входящие под контролем",
                  "Больше релевантных диалогов — лиды из ваших источников",
                  "Меньше ручного поиска клиентов в чатах и комментариях",
                  "Больше шансов на продажу за счет скорости и фокуса"
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
          <div className="rounded-2xl border border-border bg-card p-6 md:p-10">
            <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
              <div className="space-y-4">
                <h2 className="text-2xl font-semibold">Попробуйте AI Sales Assistant в вашем Telegram</h2>
                <p className="text-sm text-muted-foreground">
                  Начните с trial: подключите Telegram, ускорьте ответы с AI Copilot и включите LeadRadar для поиска лидов в ваших источниках.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center lg:justify-end">
                <TrackingLink href="/register" className={defaultLg}>
                  Начать trial
                </TrackingLink>
                <TrackingLink href="/login" className={outlineLg}>
                  Войти
                </TrackingLink>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-muted-foreground">
            Честно: LeadRadar работает только в чатах и комментариях каналов, где вы уже состоите.
          </div>
        </div>
      </section>
    </div>
  );
}

