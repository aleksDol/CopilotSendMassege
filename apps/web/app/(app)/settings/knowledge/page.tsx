"use client";

import { useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { KnowledgeItemForm } from "@/components/settings/knowledge-item-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useKnowledgeItems, useSettingsActions } from "@/lib/hooks/use-app-data";
import type { KnowledgeItem } from "@/lib/api/types";

export default function KnowledgeSettingsPage() {
  const knowledge = useKnowledgeItems();
  const actions = useSettingsActions();

  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (knowledge.isLoading) {
    return <LoadingState label="Загрузка базы знаний..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">База знаний</h1>
          <p className="text-sm text-muted-foreground">Контекст компании для подсказок ИИ.</p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            setShowCreate((prev) => !prev);
          }}
        >
          {showCreate ? "Скрыть форму" : "Добавить элемент"}
        </Button>
      </div>

      {showCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>Создать элемент</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeItemForm
              submitLabel={actions.createKnowledge.isPending ? "Сохранение..." : "Сохранить"}
              disabled={actions.createKnowledge.isPending}
              onCancel={() => setShowCreate(false)}
              onSubmit={async (payload) => {
                setError(null);
                try {
                  await actions.createKnowledge.mutateAsync(payload);
                  setShowCreate(false);
                } catch (createError) {
                  setError(createError instanceof Error ? createError.message : "Не удалось создать");
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Редактировать элемент</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeItemForm
              initial={editing}
              submitLabel={actions.updateKnowledge.isPending ? "Сохранение..." : "Сохранить"}
              disabled={actions.updateKnowledge.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (payload) => {
                setError(null);
                try {
                  await actions.updateKnowledge.mutateAsync({ id: editing.id, payload });
                  setEditing(null);
                } catch (updateError) {
                  setError(updateError instanceof Error ? updateError.message : "Не удалось обновить");
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!knowledge.data?.items?.length ? (
        <EmptyState
          title="Нет элементов"
          description="Добавьте первый элемент: продукт, цены, FAQ или работу с возражениями."
        />
      ) : (
        <div className="space-y-3">
          {knowledge.data.items.map((item) => (
            <Card key={item.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium">{item.title}</div>
                  <div className="flex gap-1">
                    <Badge variant="outline">{item.kind}</Badge>
                    <Badge variant={item.isActive ? "success" : "warning"}>{item.isActive ? "активен" : "неактивен"}</Badge>
                    <Badge variant="outline">приоритет {item.priority}</Badge>
                  </div>
                </div>
                <p className="line-clamp-3 text-sm text-muted-foreground">{item.content}</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                    Изменить
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      setError(null);
                      try {
                        await actions.updateKnowledge.mutateAsync({
                          id: item.id,
                          payload: { isActive: !item.isActive }
                        });
                      } catch (toggleError) {
                        setError(toggleError instanceof Error ? toggleError.message : "Не удалось изменить статус");
                      }
                    }}
                  >
                    {item.isActive ? "Деактивировать" : "Активировать"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
