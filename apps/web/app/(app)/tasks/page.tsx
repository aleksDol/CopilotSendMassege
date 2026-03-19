"use client";

import { useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskList } from "@/components/tasks/task-list";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useTaskActions, useTasks } from "@/lib/hooks/use-app-data";
import type { TaskItem } from "@/lib/api/types";

export default function TasksPage() {
  const [filters, setFilters] = useState({
    status: "all",
    taskType: "all",
    priority: "all"
  });
  const [isCreateOpen, setCreateOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);

  const query = useMemo(
    () => ({
      status: filters.status === "all" ? undefined : filters.status,
      taskType: filters.taskType === "all" ? undefined : filters.taskType,
      priority: filters.priority === "all" ? undefined : filters.priority,
      limit: 100
    }),
    [filters]
  );

  const tasks = useTasks(query);
  const actions = useTaskActions();

  if (tasks.isLoading) {
    return <LoadingState label="Загрузка задач..." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Задачи</h1>
          <p className="text-sm text-muted-foreground">Управление follow-up и операционными задачами.</p>
        </div>
        <button
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          onClick={() => {
            setEditingTask(null);
            setCreateOpen((prev) => !prev);
          }}
        >
          {isCreateOpen ? "Скрыть форму" : "Создать задачу"}
        </button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Фильтры</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-3">
          <Select
            value={filters.status}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value }))}
            options={[
              { label: "Все статусы", value: "all" },
              { label: "Открыта", value: "open" },
              { label: "Выполнена", value: "done" },
              { label: "Отменена", value: "canceled" }
            ]}
          />
          <Select
            value={filters.taskType}
            onChange={(event) => setFilters((prev) => ({ ...prev, taskType: event.target.value }))}
            options={[
              { label: "Все типы", value: "all" },
              { label: "Follow up", value: "follow_up" },
              { label: "Звонок", value: "call" },
              { label: "Сообщение", value: "message" },
              { label: "Проверка", value: "review" },
              { label: "Вручную", value: "manual" }
            ]}
          />
          <Select
            value={filters.priority}
            onChange={(event) => setFilters((prev) => ({ ...prev, priority: event.target.value }))}
            options={[
              { label: "Все приоритеты", value: "all" },
              { label: "Низкий", value: "low" },
              { label: "Средний", value: "medium" },
              { label: "Высокий", value: "high" }
            ]}
          />
        </CardContent>
      </Card>

      {isCreateOpen ? (
        <Card>
          <CardHeader>
            <CardTitle>Создать задачу</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskForm
              submitLabel={actions.createTask.isPending ? "Создание..." : "Создать задачу"}
              disabled={actions.createTask.isPending}
              onCancel={() => setCreateOpen(false)}
              onSubmit={async (payload) => {
                await actions.createTask.mutateAsync(payload);
                setCreateOpen(false);
              }}
            />
            {actions.createTask.error ? (
              <p className="mt-3 text-sm text-destructive">
                {actions.createTask.error instanceof Error
                  ? actions.createTask.error.message
                  : "Не удалось создать задачу. Проверьте поля и попробуйте снова."}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {editingTask ? (
        <Card>
          <CardHeader>
            <CardTitle>Редактировать задачу</CardTitle>
          </CardHeader>
          <CardContent>
            <TaskForm
              initial={editingTask}
              submitLabel={actions.patchTask.isPending ? "Сохранение..." : "Сохранить"}
              disabled={actions.patchTask.isPending}
              onCancel={() => setEditingTask(null)}
              onSubmit={async (payload) => {
                await actions.patchTask.mutateAsync({
                  taskId: editingTask.id,
                  payload
                });
                setEditingTask(null);
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {!tasks.data || tasks.data.items.length === 0 ? (
        <EmptyState title="Нет задач" description="Создайте первую задачу или запустите сканирование follow-up в бэкенде." />
      ) : (
        <TaskList
          items={tasks.data.items}
          isMutating={actions.completeTask.isPending || actions.reopenTask.isPending}
          onEdit={(task) => setEditingTask(task)}
          onComplete={async (taskId) => {
            await actions.completeTask.mutateAsync(taskId);
          }}
          onReopen={async (taskId) => {
            await actions.reopenTask.mutateAsync(taskId);
          }}
        />
      )}
    </div>
  );
}
