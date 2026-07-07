"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { systemLogsApi, type SystemLogLevel, type SystemLogRow } from "@/lib/api/system-logs";
import { useAuth } from "@/lib/auth/context";
import { formatDateTime } from "@/lib/utils/date";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { LoadingState } from "@/components/common/loading-state";

const POLL_INTERVAL_MS = 10_000;

const levelBadgeVariant: Record<SystemLogLevel, "secondary" | "warning" | "destructive"> = {
  info: "secondary",
  warn: "warning",
  error: "destructive"
};

const formatMetadata = (metadata: unknown): string => {
  if (metadata === null || metadata === undefined) {
    return "—";
  }
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
};

export default function SystemLogsPage() {
  const { token } = useAuth();
  const [rows, setRows] = useState<SystemLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [level, setLevel] = useState<"all" | SystemLogLevel>("all");
  const [moduleInput, setModuleInput] = useState("");
  const [module, setModule] = useState("");
  const [traceInput, setTraceInput] = useState("");
  const [traceId, setTraceId] = useState("");
  const [limit, setLimit] = useState(100);

  // Keep the latest values in refs so the polling interval always reads fresh
  // filters without re-registering the timer on each keystroke.
  const filtersRef = useRef({ level, module, traceId, limit });
  filtersRef.current = { level, module, traceId, limit };

  const load = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!token) {
        return;
      }

      if (!options?.silent) {
        setLoading(true);
      }
      setError(null);

      const current = filtersRef.current;

      try {
        const res = await systemLogsApi.list(token, {
          level: current.level === "all" ? undefined : current.level,
          module: current.module.trim() || undefined,
          traceId: current.traceId.trim() || undefined,
          limit: current.limit
        });
        setRows(res.logs);
        setForbidden(false);
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) {
          setForbidden(true);
          setRows([]);
        } else if (e instanceof ApiError) {
          setError(e.message);
        } else {
          setError("Не удалось загрузить системные логи");
        }
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  useEffect(() => {
    void load();
  }, [load, level, module, traceId, limit]);

  useEffect(() => {
    if (!token || forbidden) {
      return;
    }
    const timer = setInterval(() => {
      void load({ silent: true });
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [token, forbidden, load]);

  if (forbidden) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Системные логи</h1>
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
        <h1 className="text-2xl font-semibold">Системные логи</h1>
        <p className="text-sm text-muted-foreground">
          Внутренние наблюдательные события. Обновляется автоматически каждые 10 секунд.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="w-full space-y-1 sm:w-40">
            <label className="text-xs text-muted-foreground" htmlFor="logs-level">
              Level
            </label>
            <Select
              id="logs-level"
              value={level}
              onChange={(e) => setLevel(e.target.value as typeof level)}
              options={[
                { label: "Все", value: "all" },
                { label: "info", value: "info" },
                { label: "warn", value: "warn" },
                { label: "error", value: "error" }
              ]}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="logs-module">
              Module
            </label>
            <Input
              id="logs-module"
              value={moduleInput}
              onChange={(e) => setModuleInput(e.target.value)}
              placeholder="marketplace, join-worker, telegram-login"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setModule(moduleInput);
                }
              }}
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="logs-trace">
              Trace ID
            </label>
            <Input
              id="logs-trace"
              value={traceInput}
              onChange={(e) => setTraceInput(e.target.value)}
              placeholder="uuid"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setTraceId(traceInput);
                }
              }}
            />
          </div>
          <div className="w-full space-y-1 sm:w-32">
            <label className="text-xs text-muted-foreground" htmlFor="logs-limit">
              Limit
            </label>
            <Select
              id="logs-limit"
              value={String(limit)}
              onChange={(e) => setLimit(Number(e.target.value))}
              options={[
                { label: "50", value: "50" },
                { label: "100", value: "100" },
                { label: "200", value: "200" },
                { label: "500", value: "500" }
              ]}
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              setModule(moduleInput);
              setTraceId(traceInput);
            }}
          >
            Применить
          </Button>
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {loading ? (
        <LoadingState label="Загрузка логов..." />
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40 text-left">
                <th className="px-3 py-2 font-medium">Время</th>
                <th className="px-3 py-2 font-medium">Level</th>
                <th className="px-3 py-2 font-medium">Module</th>
                <th className="px-3 py-2 font-medium">Event</th>
                <th className="px-3 py-2 font-medium">Trace</th>
                <th className="px-3 py-2 font-medium">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    Нет логов по текущим фильтрам.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-border align-top last:border-0">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.createdAt)}</td>
                    <td className="px-3 py-2">
                      <Badge variant={levelBadgeVariant[row.level]}>{row.level}</Badge>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.module}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-medium">{row.event}</td>
                    <td className="px-3 py-2">
                      {row.traceId ? (
                        <button
                          type="button"
                          className="font-mono text-xs text-primary hover:underline"
                          title="Фильтровать по этому trace"
                          onClick={() => {
                            setTraceInput(row.traceId ?? "");
                            setTraceId(row.traceId ?? "");
                          }}
                        >
                          {row.traceId.slice(0, 8)}…
                        </button>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {row.metadata ? (
                        <details>
                          <summary className="cursor-pointer text-xs text-muted-foreground">Показать</summary>
                          <pre className="mt-1 max-w-md overflow-x-auto rounded bg-muted/50 p-2 text-xs">
                            {formatMetadata(row.metadata)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
