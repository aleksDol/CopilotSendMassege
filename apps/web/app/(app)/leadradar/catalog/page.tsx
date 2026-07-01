"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import {
  sourceMarketplaceApi,
  type SourceMarketplaceEntryItem,
  type SourceMarketplaceTopicItem,
  type SourceMarketplaceTopicStatus
} from "@/lib/api/source-marketplace";
import { useAuth } from "@/lib/auth/context";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils/cn";
import { CatalogEntryQuickForm } from "./catalog-entry-quick-form";
import { formatChatTypeLabel } from "./catalog-entry-helpers";

type TabId = "topics" | "entries";

const TOPIC_STATUS_LABELS: Record<SourceMarketplaceTopicStatus, string> = {
  draft: "Черновик",
  active: "Активна",
  hidden: "Скрыта"
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const topicStatusOptions = (Object.keys(TOPIC_STATUS_LABELS) as SourceMarketplaceTopicStatus[]).map((s) => ({
  label: TOPIC_STATUS_LABELS[s],
  value: s
}));

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0400-\u04FF]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, 128);
}

const emptyTopicForm = () => ({
  name: "",
  slug: "",
  description: "",
  icon: "",
  color: "#6366f1",
  status: "draft" as SourceMarketplaceTopicStatus,
  sortOrder: "0"
});

export default function LeadRadarCatalogPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState<TabId>("topics");
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [topics, setTopics] = useState<SourceMarketplaceTopicItem[]>([]);
  const [entries, setEntries] = useState<SourceMarketplaceEntryItem[]>([]);

  const [topicSearch, setTopicSearch] = useState("");
  const [topicStatusFilter, setTopicStatusFilter] = useState<"" | SourceMarketplaceTopicStatus>("");
  const [entrySearch, setEntrySearch] = useState("");
  const [entryTopicFilter, setEntryTopicFilter] = useState("");

  const [topicForm, setTopicForm] = useState(emptyTopicForm);
  const [editingTopicId, setEditingTopicId] = useState<string | null>(null);
  const [topicSaving, setTopicSaving] = useState(false);

  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingEntryTopicIds, setEditingEntryTopicIds] = useState<string[]>([]);
  const [entryTopicSaving, setEntryTopicSaving] = useState(false);

  const [actingId, setActingId] = useState<string | null>(null);

  const loadTopics = useCallback(async () => {
    if (!token) return;
    const res = await sourceMarketplaceApi.listTopics(token);
    setTopics(res.items);
  }, [token]);

  const loadEntries = useCallback(async () => {
    if (!token) return;
    const res = await sourceMarketplaceApi.listEntries(token);
    setEntries(res.items);
  }, [token]);

  const loadAll = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    setForbidden(false);
    try {
      await Promise.all([loadTopics(), loadEntries()]);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
        setTopics([]);
        setEntries([]);
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Не удалось загрузить каталог");
      }
    } finally {
      setLoading(false);
    }
  }, [token, loadTopics, loadEntries]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const resetTopicForm = () => {
    setTopicForm(emptyTopicForm());
    setEditingTopicId(null);
  };

  const resetEntryTopicEdit = () => {
    setEditingEntryId(null);
    setEditingEntryTopicIds([]);
  };

  const startEditTopic = (row: SourceMarketplaceTopicItem) => {
    setEditingTopicId(row.id);
    setTopicForm({
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      icon: row.icon,
      color: row.color,
      status: row.status,
      sortOrder: String(row.sort_order)
    });
    setTab("topics");
  };

  const startEditEntryTopics = (row: SourceMarketplaceEntryItem) => {
    setEditingEntryId(row.id);
    setEditingEntryTopicIds([...row.topic_ids]);
    setTab("entries");
  };

  const saveTopic = async () => {
    if (!token || !topicForm.name.trim() || !topicForm.slug.trim()) return;
    setTopicSaving(true);
    setError(null);
    try {
      const payload = {
        name: topicForm.name.trim(),
        slug: topicForm.slug.trim(),
        description: topicForm.description.trim() || null,
        icon: topicForm.icon.trim(),
        color: topicForm.color.trim() || "#6366f1",
        status: topicForm.status,
        sortOrder: Number.parseInt(topicForm.sortOrder, 10) || 0
      };
      if (editingTopicId) {
        await sourceMarketplaceApi.updateTopic(token, editingTopicId, payload);
      } else {
        await sourceMarketplaceApi.createTopic(token, payload);
      }
      resetTopicForm();
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось сохранить тематику");
    } finally {
      setTopicSaving(false);
    }
  };

  const saveEntryTopics = async () => {
    if (!token || !editingEntryId) return;
    setEntryTopicSaving(true);
    setError(null);
    try {
      await sourceMarketplaceApi.updateEntry(token, editingEntryId, { topicIds: editingEntryTopicIds });
      resetEntryTopicEdit();
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось обновить тематики источника");
    } finally {
      setEntryTopicSaving(false);
    }
  };

  const removeTopic = async (id: string) => {
    if (!token || !window.confirm("Удалить тематику? Связи с источниками будут сняты.")) return;
    setActingId(id);
    setError(null);
    try {
      await sourceMarketplaceApi.deleteTopic(token, id);
      if (editingTopicId === id) resetTopicForm();
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить тематику");
    } finally {
      setActingId(null);
    }
  };

  const removeEntry = async (id: string) => {
    if (!token || !window.confirm("Удалить источник из каталога?")) return;
    setActingId(id);
    setError(null);
    try {
      await sourceMarketplaceApi.deleteEntry(token, id);
      if (editingEntryId === id) resetEntryTopicEdit();
      await loadAll();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Не удалось удалить источник");
    } finally {
      setActingId(null);
    }
  };

  const allTopicsSorted = useMemo(
    () => [...topics].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [topics]
  );

  const sortedTopics = useMemo(() => {
    const s = topicSearch.trim().toLowerCase();
    return [...topics]
      .filter((row) => {
        if (topicStatusFilter && row.status !== topicStatusFilter) return false;
        if (!s) return true;
        return (
          row.name.toLowerCase().includes(s) ||
          row.slug.toLowerCase().includes(s) ||
          (row.description ?? "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }, [topics, topicSearch, topicStatusFilter]);

  const filteredEntries = useMemo(() => {
    const s = entrySearch.trim().toLowerCase();
    return entries.filter((row) => {
      if (entryTopicFilter && !row.topic_ids.includes(entryTopicFilter)) return false;
      if (!s) return true;
      return (
        row.title.toLowerCase().includes(s) ||
        (row.telegram_username ?? "").toLowerCase().includes(s) ||
        (row.telegram_chat_id ?? "").toLowerCase().includes(s) ||
        (row.note ?? "").toLowerCase().includes(s)
      );
    });
  }, [entries, entrySearch, entryTopicFilter]);

  const editingEntry = useMemo(
    () => (editingEntryId ? entries.find((row) => row.id === editingEntryId) ?? null : null),
    [editingEntryId, entries]
  );

  if (forbidden) {
    return (
      <div className="space-y-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">LeadRadar</h1>
          <LeadRadarNav />
        </div>
        <Card>
          <CardHeader>
            <CardTitle>Доступ запрещён</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Каталог источников доступен только platform admin (email в переменной окружения ADMIN_EMAILS на сервере).
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">LeadRadar</h1>
        <p className="text-sm text-muted-foreground">
          Каталог источников — тематики и Telegram-чаты для Marketplace.
        </p>
        <LeadRadarNav />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["topics", "Тематики"],
            ["entries", "Источники"]
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "rounded-md border border-border px-3 py-1.5 text-sm transition",
              tab === id ? "bg-primary text-primary-foreground" : "bg-background text-muted-foreground hover:bg-muted"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      {loading ? <LoadingState label="Загрузка каталога..." /> : null}

      {!loading && tab === "topics" ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{editingTopicId ? "Редактировать тематику" : "Создать тематику"}</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Название</span>
                <input
                  value={topicForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    setTopicForm((prev) => ({
                      ...prev,
                      name,
                      slug: editingTopicId ? prev.slug : slugify(name)
                    }));
                  }}
                  className="h-10 rounded-md border border-border bg-background px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Slug</span>
                <input
                  value={topicForm.slug}
                  onChange={(e) => setTopicForm((prev) => ({ ...prev, slug: e.target.value }))}
                  className="h-10 rounded-md border border-border bg-background px-3"
                />
              </label>
              <label className="grid gap-1 text-sm md:col-span-2">
                <span className="text-muted-foreground">Описание</span>
                <textarea
                  value={topicForm.description}
                  onChange={(e) => setTopicForm((prev) => ({ ...prev, description: e.target.value }))}
                  rows={2}
                  className="rounded-md border border-border bg-background px-3 py-2"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Иконка (строка)</span>
                <input
                  value={topicForm.icon}
                  onChange={(e) => setTopicForm((prev) => ({ ...prev, icon: e.target.value }))}
                  placeholder="briefcase"
                  className="h-10 rounded-md border border-border bg-background px-3"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Цвет</span>
                <input
                  type="color"
                  value={topicForm.color}
                  onChange={(e) => setTopicForm((prev) => ({ ...prev, color: e.target.value }))}
                  className="h-10 w-full rounded-md border border-border bg-background px-1"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Статус</span>
                <Select
                  value={topicForm.status}
                  onChange={(e) => setTopicForm((prev) => ({ ...prev, status: e.target.value as SourceMarketplaceTopicStatus }))}
                  options={topicStatusOptions}
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">Порядок сортировки</span>
                <input
                  type="number"
                  min={0}
                  value={topicForm.sortOrder}
                  onChange={(e) => setTopicForm((prev) => ({ ...prev, sortOrder: e.target.value }))}
                  className="h-10 rounded-md border border-border bg-background px-3"
                />
              </label>
              <div className="flex flex-wrap gap-2 md:col-span-2">
                <Button disabled={topicSaving || !topicForm.name.trim() || !topicForm.slug.trim()} onClick={() => void saveTopic()}>
                  {topicSaving ? "Сохранение…" : editingTopicId ? "Сохранить" : "Создать"}
                </Button>
                {editingTopicId ? (
                  <Button variant="outline" onClick={resetTopicForm}>
                    Отмена
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Тематики</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  value={topicSearch}
                  onChange={(e) => setTopicSearch(e.target.value)}
                  placeholder="Поиск"
                  className="h-10 rounded-md border border-border bg-background px-3 md:col-span-2"
                />
                <Select
                  value={topicStatusFilter}
                  onChange={(e) => setTopicStatusFilter(e.target.value as "" | SourceMarketplaceTopicStatus)}
                  options={[{ label: "Все статусы", value: "" }, ...topicStatusOptions]}
                />
              </div>

              {sortedTopics.length === 0 ? (
                <EmptyState title="Тематики не найдены" description="Создайте первую тематику для каталога." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3">Название</th>
                        <th className="py-2 pr-3">Slug</th>
                        <th className="py-2 pr-3">Статус</th>
                        <th className="py-2 pr-3">Источников</th>
                        <th className="py-2 pr-3">Порядок</th>
                        <th className="py-2 pr-3">Обновлено</th>
                        <th className="py-2">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTopics.map((row) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="py-2 pr-3">
                            <span className="inline-flex items-center gap-2">
                              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: row.color }} />
                              {row.icon ? <span className="text-muted-foreground">{row.icon}</span> : null}
                              {row.name}
                            </span>
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">{row.slug}</td>
                          <td className="py-2 pr-3">
                            <Badge variant="secondary">{TOPIC_STATUS_LABELS[row.status]}</Badge>
                          </td>
                          <td className="py-2 pr-3">{row.entry_count}</td>
                          <td className="py-2 pr-3">{row.sort_order}</td>
                          <td className="py-2 pr-3">{formatDate(row.updated_at)}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEditTopic(row)}>
                                Изменить
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actingId === row.id}
                                onClick={() => void removeTopic(row.id)}
                              >
                                Удалить
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {!loading && tab === "entries" && token ? (
        <>
          <CatalogEntryQuickForm token={token} topics={allTopicsSorted} entries={entries} onCreated={loadAll} />

          {editingEntry ? (
            <Card>
              <CardHeader>
                <CardTitle>Тематики источника</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                  <p className="font-medium">{editingEntry.title}</p>
                  <p className="text-muted-foreground">Тип: {formatChatTypeLabel(editingEntry.chat_type)}</p>
                  <p className="text-muted-foreground">
                    Username: {editingEntry.telegram_username ? `@${editingEntry.telegram_username}` : "—"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  {allTopicsSorted.map((topic) => {
                    const checked = editingEntryTopicIds.includes(topic.id);
                    return (
                      <label key={topic.id} className="inline-flex items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onCheckedChange={(value) => {
                            setEditingEntryTopicIds((prev) =>
                              value ? [...prev, topic.id] : prev.filter((id) => id !== topic.id)
                            );
                          }}
                        />
                        {topic.name}
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button disabled={entryTopicSaving} onClick={() => void saveEntryTopics()}>
                    {entryTopicSaving ? "Сохранение…" : "Сохранить тематики"}
                  </Button>
                  <Button variant="outline" onClick={resetEntryTopicEdit}>
                    Отмена
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle>Источники каталога</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-3">
                <input
                  value={entrySearch}
                  onChange={(e) => setEntrySearch(e.target.value)}
                  placeholder="Поиск"
                  className="h-10 rounded-md border border-border bg-background px-3 md:col-span-2"
                />
                <Select
                  value={entryTopicFilter}
                  onChange={(e) => setEntryTopicFilter(e.target.value)}
                  options={[
                    { label: "Все тематики", value: "" },
                    ...sortedTopics.map((t) => ({ label: t.name, value: t.id }))
                  ]}
                />
              </div>

              {filteredEntries.length === 0 ? (
                <EmptyState title="Источники не найдены" description="Добавьте первый источник в каталог." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[900px] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="py-2 pr-3">Название</th>
                        <th className="py-2 pr-3">Username</th>
                        <th className="py-2 pr-3">Тип</th>
                        <th className="py-2 pr-3">Тематики</th>
                        <th className="py-2 pr-3">Проверен</th>
                        <th className="py-2">Действия</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((row) => (
                        <tr key={row.id} className="border-b border-border/60">
                          <td className="py-2 pr-3">{row.title}</td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.telegram_username ? `@${row.telegram_username}` : "—"}
                          </td>
                          <td className="py-2 pr-3">{formatChatTypeLabel(row.chat_type)}</td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-1">
                              {row.topics.length ? (
                                row.topics.map((t) => (
                                  <Badge key={t.id} variant="outline">
                                    {t.name}
                                  </Badge>
                                ))
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 pr-3">{formatDate(row.last_checked_at)}</td>
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEditEntryTopics(row)}>
                                Тематики
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={actingId === row.id}
                                onClick={() => void removeEntry(row.id)}
                              >
                                Удалить
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
