"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { useLeadRadarConfigActions, useLeadRadarNegativeKeywords } from "@/lib/hooks/use-app-data";
import type { LeadRadarNegativeKeywordItem } from "@/lib/api/types";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function LeadRadarNegativeKeywordsPage() {
  const listQuery = useLeadRadarNegativeKeywords();
  const actions = useLeadRadarConfigActions();

  const [phrase, setPhrase] = useState("");
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const items = useMemo(() => {
    const rows = (listQuery.data?.items ?? []) as LeadRadarNegativeKeywordItem[];
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActive && !r.is_active) return false;
      if (s && !r.phrase.toLowerCase().includes(s)) return false;
      return true;
    });
  }, [listQuery.data?.items, search, onlyActive]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">LeadRadar</h1>
        <p className="text-sm text-muted-foreground">Negative keywords — фразы, которые блокируют создание лида.</p>
        <LeadRadarNav />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Добавить negative keyword</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder="phrase"
            className="h-10 min-w-[280px] flex-1 rounded-md border border-border bg-background px-3 text-sm"
          />
          <Button
            disabled={actions.addNegativeKeyword.isPending || !phrase.trim()}
            onClick={async () => {
              await actions.addNegativeKeyword.mutateAsync({ phrase: phrase.trim() });
              setPhrase("");
            }}
          >
            Добавить
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Список negative keywords</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по фразе"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm md:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Только активные
            </label>
          </div>

          {listQuery.isLoading ? <LoadingState label="Загрузка..." /> : null}
          {listQuery.error ? (
            <EmptyState title="Ошибка" description={listQuery.error instanceof Error ? listQuery.error.message : "Не удалось загрузить"} />
          ) : null}

          {!listQuery.isLoading && !listQuery.error && items.length === 0 ? (
            <EmptyState title="Negative keywords не найдены" description="Добавь фразы, которые нужно исключать." />
          ) : null}

          {items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[800px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Phrase</th>
                    <th className="py-2 pr-3">Active</th>
                    <th className="py-2 pr-3">Updated</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((k) => (
                    <tr key={k.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3 font-medium">{k.phrase}</td>
                      <td className="py-3 pr-3">{k.is_active ? "yes" : "no"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{formatDate(k.updated_at)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actions.updateNegativeKeyword.isPending}
                            onClick={() => actions.updateNegativeKeyword.mutateAsync({ id: k.id, patch: { isActive: !k.is_active } })}
                          >
                            {k.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actions.removeNegativeKeyword.isPending}
                            onClick={async () => {
                              const ok = window.confirm("Удалить negative keyword? Это действие необратимо.");
                              if (!ok) return;
                              await actions.removeNegativeKeyword.mutateAsync(k.id);
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

