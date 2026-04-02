"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { useLeadRadarConfigActions, useLeadRadarSettings } from "@/lib/hooks/use-app-data";

export default function LeadRadarSettingsPage() {
  const settingsQuery = useLeadRadarSettings();
  const actions = useLeadRadarConfigActions();

  const [dirty, setDirty] = useState(false);
  const [isEnabled, setIsEnabled] = useState(false);
  const [minScoreThreshold, setMinScoreThreshold] = useState(2);
  const [storeContextEnabled, setStoreContextEnabled] = useState(true);
  const [contextBeforeCount, setContextBeforeCount] = useState(3);
  const [contextAfterCount, setContextAfterCount] = useState(0);
  const [dedupeWindowHours, setDedupeWindowHours] = useState(72);

  useEffect(() => {
    const s = settingsQuery.data;
    if (!s) return;
    setIsEnabled(Boolean(s.isEnabled));
    setMinScoreThreshold(Number(s.minScoreThreshold ?? 2));
    setStoreContextEnabled(Boolean(s.storeContextEnabled));
    setContextBeforeCount(Number(s.contextBeforeCount ?? 3));
    setContextAfterCount(Number(s.contextAfterCount ?? 0));
    setDedupeWindowHours(Number(s.dedupeWindowHours ?? 72));
    setDirty(false);
  }, [settingsQuery.data]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">LeadRadar</h1>
        <p className="text-sm text-muted-foreground">Settings — включение LeadRadar и основные параметры.</p>
        <LeadRadarNav />
      </div>

      {settingsQuery.isLoading ? <LoadingState label="Загрузка настроек..." /> : null}
      {settingsQuery.error ? (
        <EmptyState
          title="Ошибка"
          description={settingsQuery.error instanceof Error ? settingsQuery.error.message : "Не удалось загрузить настройки"}
        />
      ) : null}

      {!settingsQuery.isLoading && !settingsQuery.error ? (
        <Card>
          <CardHeader>
            <CardTitle>Параметры</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={(e) => {
                  setIsEnabled(e.target.checked);
                  setDirty(true);
                }}
              />
              <span className="font-medium">Enable LeadRadar</span>
              <span className="text-muted-foreground">(без этого лиды не будут создаваться)</span>
            </label>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">minScoreThreshold</div>
                <input
                  type="number"
                  min={0}
                  value={String(minScoreThreshold)}
                  onChange={(e) => {
                    setMinScoreThreshold(Number(e.target.value || 0));
                    setDirty(true);
                  }}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={storeContextEnabled}
                    onChange={(e) => {
                      setStoreContextEnabled(e.target.checked);
                      setDirty(true);
                    }}
                  />
                  <span className="font-medium">storeContextEnabled</span>
                </label>
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">contextBeforeCount</div>
                <input
                  type="number"
                  min={0}
                  value={String(contextBeforeCount)}
                  onChange={(e) => {
                    setContextBeforeCount(Number(e.target.value || 0));
                    setDirty(true);
                  }}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">contextAfterCount</div>
                <input
                  type="number"
                  min={0}
                  value={String(contextAfterCount)}
                  onChange={(e) => {
                    setContextAfterCount(Number(e.target.value || 0));
                    setDirty(true);
                  }}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">dedupeWindowHours</div>
                <input
                  type="number"
                  min={1}
                  value={String(dedupeWindowHours)}
                  onChange={(e) => {
                    setDedupeWindowHours(Number(e.target.value || 1));
                    setDirty(true);
                  }}
                  className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
                />
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-muted-foreground">{dirty ? "Есть несохранённые изменения" : " "}</div>
              <Button
                disabled={!dirty || actions.updateSettings.isPending}
                onClick={async () => {
                  await actions.updateSettings.mutateAsync({
                    isEnabled,
                    minScoreThreshold,
                    storeContextEnabled,
                    contextBeforeCount,
                    contextAfterCount,
                    dedupeWindowHours
                  });
                  setDirty(false);
                }}
              >
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

