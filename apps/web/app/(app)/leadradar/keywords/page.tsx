"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { useLeadRadarConfigActions, useLeadRadarKeywords } from "@/lib/hooks/use-app-data";
import type { LeadRadarKeywordItem, LeadRadarKeywordTarget, LeadRadarMatchType } from "@/lib/api/types";

const MATCH_TYPES: LeadRadarMatchType[] = ["contains", "exact", "regex"];
const TARGETS: Array<{ value: LeadRadarKeywordTarget; label: string }> = [
  { value: "message", label: "Сообщения" },
  { value: "author_profile", label: "Профили авторов" }
];

/** Stored for API/DB compatibility; does not affect matching or scoring — only keyword text + match type matter. */
const DEFAULT_KEYWORD_CATEGORY = "general" as const;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function LeadRadarKeywordsPage() {
  const actions = useLeadRadarConfigActions();
  const [onlyActive, setOnlyActive] = useState(false);

  const keywordsQuery = useLeadRadarKeywords({
    is_active: onlyActive ? true : undefined
  });

  const [keyword, setKeyword] = useState("");
  const [matchType, setMatchType] = useState<LeadRadarMatchType>("contains");
  const [target, setTarget] = useState<LeadRadarKeywordTarget>("message");
  const [priority, setPriority] = useState(0);

  const items = useMemo(() => {
    const rows = (keywordsQuery.data?.items ?? []) as LeadRadarKeywordItem[];
    return rows.slice().sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  }, [keywordsQuery.data?.items]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">LeadRadar</h1>
        <p className="text-sm text-muted-foreground">
          Keywords — ключевые фразы, по которым LeadRadar ищет лиды. Учитываются только текст фразы и тип совпадения (contains / exact / regex).
        </p>
        <LeadRadarNav />
      </div>

      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="font-medium">Не знаете, какие фразы искать?</p>
            <p className="text-sm text-muted-foreground">Настройте через ИИ — получите preview ключевых фраз и тематик чатов.</p>
          </div>
          <Link href="/leadradar/setup" className="shrink-0">
            <Button variant="secondary">AI настройка</Button>
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Добавить keyword</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-5">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="keyword"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm md:col-span-2"
          />
          <select
            value={matchType}
            onChange={(e) => setMatchType(e.target.value as LeadRadarMatchType)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {MATCH_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value as LeadRadarKeywordTarget)}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          >
            {TARGETS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            value={String(priority)}
            onChange={(e) => setPriority(Number(e.target.value || 0))}
            type="number"
            min={0}
            className="h-10 rounded-md border border-border bg-background px-3 text-sm"
          />

          <div className="md:col-span-5">
            <Button
              disabled={actions.addKeyword.isPending || !keyword.trim()}
              onClick={async () => {
                await actions.addKeyword.mutateAsync({
                  keyword: keyword.trim(),
                  target,
                  matchType,
                  category: DEFAULT_KEYWORD_CATEGORY,
                  priority
                });
                setKeyword("");
                setTarget("message");
                setPriority(0);
              }}
            >
              Добавить
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Список keywords</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Только активные
            </label>
          </div>

          {keywordsQuery.isLoading ? <LoadingState label="Загрузка keywords..." /> : null}
          {keywordsQuery.error ? (
            <EmptyState
              title="Ошибка"
              description={keywordsQuery.error instanceof Error ? keywordsQuery.error.message : "Не удалось загрузить keywords"}
            />
          ) : null}

          {!keywordsQuery.isLoading && !keywordsQuery.error && items.length === 0 ? (
            <EmptyState title="Keywords не найдены" description="Добавь хотя бы одну ключевую фразу." />
          ) : null}

          {items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Keyword</th>
                    <th className="py-2 pr-3">Match</th>
                    <th className="py-2 pr-3">Scope</th>
                    <th className="py-2 pr-3">Priority</th>
                    <th className="py-2 pr-3">Active</th>
                    <th className="py-2 pr-3">Updated</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((k) => (
                    <tr key={k.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3 font-medium">{k.keyword}</td>
                      <td className="py-3 pr-3">{k.match_type}</td>
                      <td className="py-3 pr-3">
                        {(k.target ?? "message") === "author_profile" ? "Профили" : "Сообщения"}
                      </td>
                      <td className="py-3 pr-3">{k.priority}</td>
                      <td className="py-3 pr-3">{k.is_active ? "yes" : "no"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{formatDate(k.updated_at)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actions.updateKeyword.isPending}
                            onClick={() => actions.updateKeyword.mutateAsync({ id: k.id, patch: { isActive: !k.is_active } })}
                          >
                            {k.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actions.removeKeyword.isPending}
                            onClick={async () => {
                              const ok = window.confirm("Удалить keyword? Это действие необратимо.");
                              if (!ok) return;
                              try {
                                await actions.removeKeyword.mutateAsync(k.id);
                              } catch (err) {
                                const msg = err instanceof Error ? err.message : "Не удалось удалить keyword";
                                window.alert(`Ошибка удаления: ${msg}`);
                              }
                            }}
                          >
                            Remove
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
