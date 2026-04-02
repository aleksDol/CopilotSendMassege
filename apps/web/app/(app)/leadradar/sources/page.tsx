"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { useLeadRadarConfigActions, useLeadRadarSources } from "@/lib/hooks/use-app-data";
import type { LeadRadarSourceItem } from "@/lib/api/types";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function LeadRadarSourcesPage() {
  const sources = useLeadRadarSources();
  const actions = useLeadRadarConfigActions();

  const [link, setLink] = useState("");

  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  const items = useMemo(() => {
    const rows = (sources.data?.items ?? []) as LeadRadarSourceItem[];
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActive && !r.is_active) return false;
      if (s) {
        const title = (r.chat_title ?? "").toLowerCase();
        if (!title.includes(s) && !r.telegram_chat_id.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }, [sources.data?.items, search, onlyActive]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">LeadRadar</h1>
        <p className="text-sm text-muted-foreground">Sources — список Telegram-чатов, которые мониторит LeadRadar.</p>
        <LeadRadarNav />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Добавить чат по ссылке</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-4">
          <input
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://t.me/chatname или @chatname"
            className="h-10 rounded-md border border-border bg-background px-3 text-sm md:col-span-3"
          />
          <div className="text-xs text-muted-foreground flex items-center">
            Поддерживаются публичные группы/supergroups (t.me/username).
          </div>

          <div className="md:col-span-4 flex flex-wrap items-center gap-2">
            <Button
              disabled={actions.addSourceByLink.isPending || !link.trim()}
              onClick={async () => {
                await actions.addSourceByLink.mutateAsync({ link: link.trim() });
                setLink("");
              }}
            >
              Добавить
            </Button>
            <div className="text-xs text-muted-foreground">Если чат не найден — проверь, что он публичный и доступен аккаунту Telegram.</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Список sources</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-2 md:grid-cols-3">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по названию / chat id"
              className="h-10 rounded-md border border-border bg-background px-3 text-sm md:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
              Только активные
            </label>
          </div>

          {sources.isLoading ? <LoadingState label="Загрузка sources..." /> : null}
          {sources.error ? (
            <EmptyState title="Ошибка" description={sources.error instanceof Error ? sources.error.message : "Не удалось загрузить sources"} />
          ) : null}

          {!sources.isLoading && !sources.error && items.length === 0 ? (
            <EmptyState title="Sources не найдены" description="Добавь хотя бы один чат, чтобы LeadRadar начал мониторинг." />
          ) : null}

          {items.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="py-2 pr-3">Chat</th>
                    <th className="py-2 pr-3">Title</th>
                    <th className="py-2 pr-3">Type</th>
                    <th className="py-2 pr-3">Active</th>
                    <th className="py-2 pr-3">Updated</th>
                    <th className="py-2 pr-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((s) => (
                    <tr key={s.id} className="border-b border-border/60 align-top">
                      <td className="py-3 pr-3 font-medium">{s.telegram_chat_id}</td>
                      <td className="py-3 pr-3">{s.chat_title ?? "—"}</td>
                      <td className="py-3 pr-3">{s.chat_type ?? "—"}</td>
                      <td className="py-3 pr-3">{s.is_active ? "yes" : "no"}</td>
                      <td className="py-3 pr-3 text-muted-foreground">{formatDate(s.updated_at)}</td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={actions.updateSource.isPending}
                            onClick={() => actions.updateSource.mutateAsync({ id: s.id, isActive: !s.is_active })}
                          >
                            {s.is_active ? "Disable" : "Enable"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={actions.removeSource.isPending}
                            onClick={async () => {
                              const ok = window.confirm(
                                "Убрать этот чат из мониторинга LeadRadar? Запись в списке Sources будет удалена; лиды в Inbox останутся."
                              );
                              if (!ok) return;
                              await actions.removeSource.mutateAsync(s.id);
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

