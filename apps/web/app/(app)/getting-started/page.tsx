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
    title: "РџРѕРґРєР»СЋС‡РёС‚Рµ Telegram",
    description: "РџРѕРґРєР»СЋС‡РёС‚Рµ СЃРІРѕР№ СЂР°Р±РѕС‡РёР№ Telegram-Р°РєРєР°СѓРЅС‚, С‡С‚РѕР±С‹ РІРёРґРµС‚СЊ РІСЃРµ РґРёР°Р»РѕРіРё РІ СЃРёСЃС‚РµРјРµ."
  },
  {
    title: "Р—Р°РїРѕР»РЅРёС‚Рµ Р±Р°Р·Сѓ Р·РЅР°РЅРёР№",
    description: "Р”РѕР±Р°РІСЊС‚Рµ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РєРѕРјРїР°РЅРёРё, С†РµРЅС‹, FAQ Рё СѓСЃР»РѕРІРёСЏ СЂР°Р±РѕС‚С‹. Р­С‚Рѕ РЅСѓР¶РЅРѕ, С‡С‚РѕР±С‹ AI РґР°РІР°Р» С‚РѕС‡РЅС‹Рµ РѕС‚РІРµС‚С‹."
  },
  {
    title: "РћС‚РєСЂРѕР№С‚Рµ СЂР°Р·РґРµР» В«Р§Р°С‚С‹В»",
    description: "Р—РґРµСЃСЊ РІС‹ СѓРІРёРґРёС‚Рµ РІСЃРµ РІС…РѕРґСЏС‰РёРµ РґРёР°Р»РѕРіРё СЃ РєР»РёРµРЅС‚Р°РјРё."
  },
  {
    title: "РСЃРїРѕР»СЊР·СѓР№С‚Рµ AI-РїРѕРґСЃРєР°Р·РєРё",
    description: "РЎРёСЃС‚РµРјР° РїСЂРµРґР»РѕР¶РёС‚, С‡С‚Рѕ РјРѕР¶РЅРѕ РѕС‚РІРµС‚РёС‚СЊ РєР»РёРµРЅС‚Сѓ: РѕС‚РїСЂР°РІРёС‚СЊ РєР°Рє РµСЃС‚СЊ, РѕС‚СЂРµРґР°РєС‚РёСЂРѕРІР°С‚СЊ РёР»Рё СЃРіРµРЅРµСЂРёСЂРѕРІР°С‚СЊ РґСЂСѓРіРѕР№ РІР°СЂРёР°РЅС‚."
  },
  {
    title: "РЎР»РµРґРёС‚Рµ Р·Р° Р·Р°РґР°С‡Р°РјРё",
    description: "РЎРёСЃС‚РµРјР° РїРѕРґСЃРєР°Р¶РµС‚, РіРґРµ РІС‹ РЅРµ РѕС‚РІРµС‚РёР»Рё Рё РіРґРµ РЅСѓР¶РЅРѕ СЃРґРµР»Р°С‚СЊ follow-up."
  }
];

const featureCards = [
  {
    title: "Р§Р°С‚С‹",
    description: "Р’СЃРµ Р»РёС‡РЅС‹Рµ РґРёР°Р»РѕРіРё РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ. Р‘РѕР»СЊС€Рµ РЅРµ РЅСѓР¶РЅРѕ РїРµСЂРµРєР»СЋС‡Р°С‚СЊСЃСЏ РјРµР¶РґСѓ РѕРєРЅР°РјРё.",
    icon: MessageCircle
  },
  {
    title: "AI-РїРѕРјРѕС‰РЅРёРє",
    description: "РџРѕРґСЃРєР°Р·С‹РІР°РµС‚, С‡С‚Рѕ РЅР°РїРёСЃР°С‚СЊ РєР»РёРµРЅС‚Сѓ: РѕС‚РІРµС‡Р°РµС‚ РЅР° РІРѕРїСЂРѕСЃС‹, РїРѕРјРѕРіР°РµС‚ РїСЂРѕРґР°РІР°С‚СЊ Рё СѓС‡РёС‚С‹РІР°РµС‚ РєРѕРЅС‚РµРєСЃС‚ РґРёР°Р»РѕРіР°.",
    icon: Bot
  },
  {
    title: "Р—Р°РґР°С‡Рё",
    description: "РЎРёСЃС‚РµРјР° РѕС‚СЃР»РµР¶РёРІР°РµС‚, РєРѕРјСѓ РІС‹ РЅРµ РѕС‚РІРµС‚РёР»Рё, РіРґРµ РєР»РёРµРЅС‚ В«Р·Р°РІРёСЃВ» Рё РіРґРµ РЅСѓР¶РЅРѕ РЅР°РїРёСЃР°С‚СЊ РїРѕРІС‚РѕСЂРЅРѕ.",
    icon: CheckSquare
  },
  {
    title: "Р”Р°С€Р±РѕСЂРґ",
    description: "РћР±С‰Р°СЏ РєР°СЂС‚РёРЅР°: СЃРєРѕР»СЊРєРѕ РґРёР°Р»РѕРіРѕРІ, СЃРєРѕР»СЊРєРѕ С‚СЂРµР±СѓСЋС‚ РѕС‚РІРµС‚Р° Рё РєР°РєР°СЏ Р°РєС‚РёРІРЅРѕСЃС‚СЊ СЃРµР№С‡Р°СЃ РІ СЂР°Р±РѕС‚Рµ.",
    icon: ChartColumn
  },
  {
    title: "Р‘Р°Р·Р° Р·РЅР°РЅРёР№",
    description: "РҐСЂР°РЅРёС‚ FAQ, С†РµРЅС‹, РїСЂР°РІРёР»Р° Рё РѕРїРёСЃР°РЅРёРµ РїСЂРѕРґСѓРєС‚Р°. AI РёСЃРїРѕР»СЊР·СѓРµС‚ СЌС‚Рё РґР°РЅРЅС‹Рµ РґР»СЏ РѕС‚РІРµС‚РѕРІ.",
    icon: BookOpen
  },
  {
    title: "РџРѕР»РёС‚РёРєР° РѕС‚РІРµС‚РѕРІ",
    description: "Р’С‹ Р·Р°РґР°С‘С‚Рµ СЃС‚РёР»СЊ РѕР±С‰РµРЅРёСЏ, РѕРіСЂР°РЅРёС‡РµРЅРёСЏ Рё РїСЂР°РІРёР»Р°, С‡С‚РѕР±С‹ AI РѕС‚РІРµС‡Р°Р» С‚Р°Рє, РєР°Рє РЅСѓР¶РЅРѕ РІР°Рј.",
    icon: ShieldCheck
  }
];

const valuePoints = [
  "РќРµ С‚РµСЂСЏС‚СЊ РєР»РёРµРЅС‚РѕРІ.",
  "Р‘С‹СЃС‚СЂРµРµ РѕС‚РІРµС‡Р°С‚СЊ.",
  "Р”РµСЂР¶Р°С‚СЊ РІСЃРµ РґРёР°Р»РѕРіРё РїРѕРґ РєРѕРЅС‚СЂРѕР»РµРј.",
  "РќРµ Р·Р°Р±С‹РІР°С‚СЊ РїСЂРѕ follow-up.",
  "РЎС‚Р°РЅРґР°СЂС‚РёР·РёСЂРѕРІР°С‚СЊ РѕС‚РІРµС‚С‹.",
  "Р Р°Р·РіСЂСѓР·РёС‚СЊ РјРµРЅРµРґР¶РµСЂРѕРІ."
];

const tips = [
  "РЎРЅР°С‡Р°Р»Р° РїРѕРґРєР»СЋС‡РёС‚Рµ Telegram.",
  "Р”РѕР±Р°РІСЊС‚Рµ Р±Р°Р·РѕРІСѓСЋ РёРЅС„РѕСЂРјР°С†РёСЋ Рѕ РєРѕРјРїР°РЅРёРё.",
  "РќР°С‡РЅРёС‚Рµ СЃ СЂРµР°Р»СЊРЅС‹С… РґРёР°Р»РѕРіРѕРІ.",
  "РСЃРїРѕР»СЊР·СѓР№С‚Рµ AI РєР°Рє РїРѕРјРѕС‰РЅРёРєР°, Р° РЅРµ Р°РІС‚РѕРїРёР»РѕС‚.",
  "РћР±СЂР°С‰Р°Р№С‚Рµ РІРЅРёРјР°РЅРёРµ РЅР° С‡Р°С‚С‹ СЃ РїРѕРјРµС‚РєРѕР№ В«Р¶РґС‘С‚ РѕС‚РІРµС‚Р°В»."
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
            <h1 className="text-2xl font-semibold">РќР°С‡Р°Р»Рѕ СЂР°Р±РѕС‚С‹</h1>
            <p className="text-sm text-muted-foreground">
              Р’СЃС‘, С‡С‚Рѕ РЅСѓР¶РЅРѕ, С‡С‚РѕР±С‹ РЅР°С‡Р°С‚СЊ СЂР°Р±РѕС‚Р°С‚СЊ СЃ РєР»РёРµРЅС‚Р°РјРё РІ Telegram Р±С‹СЃС‚СЂРµРµ Рё СЌС„С„РµРєС‚РёРІРЅРµРµ.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Р§С‚Рѕ СЌС‚Рѕ Р·Р° СЃРµСЂРІРёСЃ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Р­С‚РѕС‚ СЃРµСЂРІРёСЃ РїРѕРјРѕРіР°РµС‚ РІРµСЃС‚Рё РїСЂРѕРґР°Р¶Рё Рё РѕР±С‰РµРЅРёРµ СЃ РєР»РёРµРЅС‚Р°РјРё РІ Telegram РІ РѕРґРЅРѕРј СѓРґРѕР±РЅРѕРј РёРЅС‚РµСЂС„РµР№СЃРµ.
            </p>
            <div className="grid gap-2 md:grid-cols-2">
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">Р’СЃРµ Р»РёС‡РЅС‹Рµ С‡Р°С‚С‹ РІ РѕРґРЅРѕРј РјРµСЃС‚Рµ.</div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">РџРѕРґСЃРєР°Р·РєРё РѕС‚ AI, С‡С‚Рѕ РѕС‚РІРµС‚РёС‚СЊ РєР»РёРµРЅС‚Сѓ.</div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">РљРѕРЅС‚СЂРѕР»СЊ РЅР°Рґ РґРёР°Р»РѕРіР°РјРё Рё Р»РёРґР°РјРё.</div>
              <div className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">РќР°РїРѕРјРёРЅР°РЅРёСЏ, РєРѕРјСѓ РЅСѓР¶РЅРѕ РѕС‚РІРµС‚РёС‚СЊ.</div>
            </div>
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-medium">Р­С‚Рѕ РЅРµ РїСЂРѕСЃС‚Рѕ С‡Р°С‚ вЂ” СЌС‚Рѕ РёРЅСЃС‚СЂСѓРјРµРЅС‚ РґР»СЏ РїСЂРѕРґР°Р¶.</div>
            <p className="text-xs text-muted-foreground">
              Р”РѕРєСѓРјРµРЅС‚С‹:{" "}
              <Link href="/offer" className="text-primary underline-offset-2 hover:underline">
                РѕС„РµСЂС‚Р°
              </Link>
              ,{" "}
              <Link href="/privacy" className="text-primary underline-offset-2 hover:underline">
                РєРѕРЅС„РёРґРµРЅС†РёР°Р»СЊРЅРѕСЃС‚СЊ
              </Link>
              ,{" "}
              <Link href="/personal-data" className="text-primary underline-offset-2 hover:underline">
                РїРµСЂСЃРѕРЅР°Р»СЊРЅС‹Рµ РґР°РЅРЅС‹Рµ
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>РљР°Рє РЅР°С‡Р°С‚СЊ</CardTitle>
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
            <CardTitle>РћСЃРЅРѕРІРЅС‹Рµ РІРѕР·РјРѕР¶РЅРѕСЃС‚Рё</CardTitle>
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
              <CardTitle>РџРѕС‡РµРјСѓ СЌС‚Рѕ СѓРґРѕР±РЅРѕ</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {valuePoints.map((point) => (
                <div key={point} className="flex items-start gap-2 text-sm">
                  <CircleCheckBig className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p className="text-muted-foreground">{point}</p>
                </div>
              ))}
              <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm font-medium">
                Р’ РёС‚РѕРіРµ вЂ” Р±РѕР»СЊС€Рµ Р·Р°РєСЂС‹С‚С‹С… СЃРґРµР»РѕРє Рё РјРµРЅСЊС€Рµ РїРѕС‚РµСЂСЊ.
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>РЎРѕРІРµС‚С‹</CardTitle>
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
            <CardTitle>Р‘С‹СЃС‚СЂС‹Рµ РґРµР№СЃС‚РІРёСЏ</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Link
              href="/settings/telegram"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:brightness-110"
            >
              <Smartphone className="h-4 w-4" />
              РџРѕРґРєР»СЋС‡РёС‚СЊ Telegram
            </Link>
            <Link
              href="/chats"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
            >
              <MessageCircle className="h-4 w-4" />
              РћС‚РєСЂС‹С‚СЊ С‡Р°С‚С‹
            </Link>
            <Link
              href="/settings/ai-brain"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <BookOpen className="h-4 w-4" />
              Р—Р°РїРѕР»РЅРёС‚СЊ Р±Р°Р·Сѓ Р·РЅР°РЅРёР№
            </Link>
            <Link
              href="/settings/ai-brain"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted"
            >
              <ShieldCheck className="h-4 w-4" />
              РќР°СЃС‚СЂРѕРёС‚СЊ РїРѕР»РёС‚РёРєСѓ РѕС‚РІРµС‚РѕРІ
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
