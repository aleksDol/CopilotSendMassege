"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { AiSuggestion } from "@/lib/api/types";

type Mode = "default" | "shorter" | "more_friendly" | "more_sales" | "handle_objection";

export function AiSuggestionPanel({
  suggestion,
  context,
  onSuggest,
  onAccept,
  onReject,
  onInsert,
  isLoading
}: {
  suggestion: AiSuggestion | null;
  context: { leadStage: string | null; leadTemperature: string | null; lastClientIntent: string | null } | null;
  onSuggest: (mode: Mode) => Promise<void>;
  onAccept: (suggestionId: string) => Promise<void>;
  onReject: (suggestionId: string) => Promise<void>;
  onInsert: (text: string) => void;
  isLoading: boolean;
}) {
  const [mode, setMode] = useState<Mode>("default");

  return (
    <Card className="h-full border-border/80 bg-card/95 shadow-sm">
      <CardHeader>
        <CardTitle>ИИ-копилот</CardTitle>
        <CardDescription>Сгенерировать один практичный вариант ответа.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <label className="text-xs uppercase text-muted-foreground">Режим</label>
          <Select
            value={mode}
            onChange={(event) => setMode(event.target.value as Mode)}
            options={[
              { label: "По умолчанию", value: "default" },
              { label: "Короче", value: "shorter" },
              { label: "Дружелюбнее", value: "more_friendly" },
              { label: "Продажнее", value: "more_sales" },
              { label: "Работа с возражением", value: "handle_objection" }
            ]}
          />
          <Button className="w-full" onClick={() => onSuggest(mode)} disabled={isLoading}>
            {isLoading ? "Генерация..." : "Предложить ответ"}
          </Button>
        </div>

        <div className="rounded-xl border border-border/80 bg-gradient-to-b from-muted/30 via-card to-card p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
            <div className="min-w-0 text-sm font-medium text-foreground">Предложенный ответ</div>
            <Badge variant="outline" className="h-5 shrink-0 rounded-full border-border/70 bg-card px-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              AI Copilot
            </Badge>
          </div>

          <div className="pt-3">
            {isLoading && !suggestion ? (
              <div className="space-y-3 py-1">
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-full animate-pulse rounded bg-muted" />
                <div className="h-3 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-8 w-full animate-pulse rounded-md bg-muted/80" />
              </div>
            ) : suggestion ? (
              <>
                <div className="max-h-64 overflow-y-auto pr-1">
                  <p className="max-w-full whitespace-pre-wrap break-words text-[14px] leading-6 text-foreground/95">{suggestion.text}</p>
                </div>

                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
                  <Badge variant="outline" className="rounded-full border-border/70 bg-muted/10 px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                    режим: {suggestion.mode}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-border/70 bg-muted/10 px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                    статус: {suggestion.status}
                  </Badge>
                  {suggestion.confidence !== null ? (
                    <Badge variant="outline" className="rounded-full border-border/70 bg-muted/10 px-2 py-0.5 text-[11px] font-normal text-muted-foreground">
                      уверенность: {suggestion.confidence}
                    </Badge>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
                  <Button size="sm" onClick={() => onInsert(suggestion.text)}>
                    Вставить в поле
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => onAccept(suggestion.id)}>
                    Принять
                  </Button>
                  <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => onReject(suggestion.id)}>
                    Отклонить
                  </Button>
                </div>
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-border/80 bg-card/60 px-4 py-5 text-sm leading-relaxed text-muted-foreground">
                Подсказки пока нет. Выберите режим выше и нажмите «Предложить ответ», чтобы получить аккуратный вариант ответа для клиента.
              </div>
            )}
          </div>
        </div>

        {context ? (
          <div className="space-y-1 rounded-lg border border-border/70 bg-card/80 p-3 text-xs text-muted-foreground">
            <div>этап лида: {context.leadStage ?? "-"}</div>
            <div>температура: {context.leadTemperature ?? "-"}</div>
            <div>последний интент: {context.lastClientIntent ?? "-"}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
