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
    <Card className="h-full">
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

        <div className="space-y-2">
          <div className="text-xs uppercase text-muted-foreground">Подсказка</div>
          {suggestion ? (
            <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-3">
              <p className="text-sm leading-relaxed">{suggestion.text}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">режим: {suggestion.mode}</Badge>
                <Badge variant="outline">статус: {suggestion.status}</Badge>
                {suggestion.confidence !== null ? <Badge variant="outline">уверенность: {suggestion.confidence}</Badge> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => onInsert(suggestion.text)}>
                  Вставить в поле
                </Button>
                <Button size="sm" variant="outline" onClick={() => onAccept(suggestion.id)}>
                  Принять
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onReject(suggestion.id)}>
                  Отклонить
                </Button>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
              Подсказки пока нет. Выберите режим и нажмите «Предложить ответ».
            </p>
          )}
        </div>

        {context ? (
          <div className="space-y-1 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">
            <div>этап лида: {context.leadStage ?? "-"}</div>
            <div>температура: {context.leadTemperature ?? "-"}</div>
            <div>последний интент: {context.lastClientIntent ?? "-"}</div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
