"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

const SALES_URL = (process.env.NEXT_PUBLIC_SALES_TELEGRAM_URL ?? "").trim() || "https://t.me";

export function TrialPaywallCard() {
  return (
    <Card className="border-warning/40 bg-warning/10">
      <CardHeader>
        <CardTitle>Пробный период закончился</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Чтобы продолжить работу с клиентами и использовать AI - подключите доступ.
        </p>
        <div className="space-y-2 text-sm">
          <p>- ответы клиентам с помощью AI</p>
          <p>- все диалоги в одном месте</p>
          <p>- быстрые ответы без потери лидов</p>
        </div>
        <p className="text-xs text-muted-foreground">Данные и чаты сохранены.</p>
        <Link
          href={SALES_URL}
          target="_blank"
          rel="noreferrer"
          className={cn(buttonVariants({ variant: "secondary" }))}
        >
          Получить доступ
        </Link>
      </CardContent>
    </Card>
  );
}
