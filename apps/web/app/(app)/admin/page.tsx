"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { adminApi, type AdminUserRow } from "@/lib/api/admin";
import { useAuth } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/utils/date";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/common/loading-state";

const statusLabel: Record<AdminUserRow["subscriptionStatus"], string> = {
  trial: "Пробный",
  active: "Активна",
  inactive: "Неактивна"
};

export default function AdminPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");
  const [actingId, setActingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      return;
    }

    setLoading(true);
    setError(null);
    setForbidden(false);

    try {
      const res = await adminApi.listUsers(token, {
        search: search.trim() || undefined,
        filter
      });
      setRows(res.users);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) {
        setForbidden(true);
        setRows([]);
      } else if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Не удалось загрузить пользователей");
      }
    } finally {
      setLoading(false);
    }
  }, [token, search, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const runAction = async (
    userId: string,
    action: "activate" | "deactivate" | "extend" | "shift_period",
    payload?: { periodDeltaDays?: number }
  ) => {
    if (!token) {
      return;
    }

    setActingId(userId);
    setError(null);

    try {
      await adminApi.updateSubscription(token, userId, { action, ...payload });
      await load();
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
      } else {
        setError("Ошибка при обновлении подписки");
      }
    } finally {
      setActingId(null);
    }
  };

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Админ</h1>
        <Card>
          <CardHeader>
            <CardTitle>Доступ запрещён</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Ваш аккаунт не входит в список администраторов (переменная окружения ADMIN_EMAILS на API).
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Админ</h1>
        <p className="text-sm text-muted-foreground">Пользователи и ручное управление подпиской компании (по пользователю).</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="admin-search">
              Поиск по email
            </label>
            <Input
              id="admin-search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="user@example.com"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setSearch(searchInput);
                }
              }}
            />
          </div>
          <div className="w-full space-y-1 sm:w-48">
            <label className="text-xs text-muted-foreground" htmlFor="admin-filter">
              Подписка
            </label>
            <Select
              id="admin-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              options={[
                { label: "Все", value: "all" },
                { label: "Активные / пробные", value: "active" },
                { label: "Неактивные", value: "inactive" }
              ]}
            />
          </div>
          <Button type="button" variant="secondary" onClick={() => setSearch(searchInput)}>
            Найти
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <LoadingState label="Загрузка списка..." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Регистрация</th>
                <th className="px-3 py-2 font-medium">Подписка</th>
                <th className="px-3 py-2 font-medium">До</th>
                <th className="px-3 py-2 font-medium">Telegram</th>
                <th className="px-3 py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Нет пользователей по текущим фильтрам.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const busy = actingId === row.id;
                  return (
                    <tr key={row.id} className="border-b border-border last:border-0">
                      <td className="px-3 py-2">{row.email}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                      <td className="px-3 py-2">{statusLabel[row.subscriptionStatus]}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.subscriptionExpiresAt)}</td>
                      <td className="px-3 py-2">{row.telegramConnected ? "Да" : "Нет"}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => void runAction(row.id, "activate")}
                          >
                            Активировать
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void runAction(row.id, "deactivate")}
                          >
                            Деактивировать
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => void runAction(row.id, "extend")}
                          >
                            Продлить
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              const raw = window.prompt("Сдвиг конца периода в днях (можно отрицательное число, например -3):", "1");
                              if (!raw) return;
                              const delta = Number.parseInt(raw, 10);
                              if (!Number.isFinite(delta) || delta === 0) {
                                setError("Введите целое число дней, отличное от 0.");
                                return;
                              }
                              void runAction(row.id, "shift_period", { periodDeltaDays: delta });
                            }}
                          >
                            Сдвиг периода +/-дни
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
