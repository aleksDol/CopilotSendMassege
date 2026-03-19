"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { TaskItem } from "@/lib/api/types";

type TaskDraft = {
  conversationId?: string;
  title: string;
  description?: string;
  taskType: string;
  priority: string;
  dueAt?: string;
};

export function TaskForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  disabled
}: {
  initial?: Partial<TaskItem>;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (payload: TaskDraft) => Promise<void>;
  disabled?: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("follow_up");
  const [priority, setPriority] = useState("medium");
  const [dueAt, setDueAt] = useState("");
  const [conversationId, setConversationId] = useState("");

  useEffect(() => {
    setTitle(initial?.title ?? "");
    setDescription(initial?.description ?? "");
    setTaskType(initial?.taskType ?? "follow_up");
    setPriority(initial?.priority ?? "medium");
    setDueAt(initial?.dueAt ? initial.dueAt.slice(0, 16) : "");
    setConversationId(initial?.conversation?.id ?? "");
  }, [initial]);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({
          title,
          description: description || undefined,
          taskType,
          priority,
          dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
          conversationId: conversationId || undefined
        });
      }}
    >
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Название</label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Описание</label>
        <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
      </div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Тип задачи</label>
          <Select
            value={taskType}
            onChange={(event) => setTaskType(event.target.value)}
            options={[
              { label: "Follow up", value: "follow_up" },
              { label: "Звонок", value: "call" },
              { label: "Сообщение", value: "message" },
              { label: "Проверка", value: "review" },
              { label: "Вручную", value: "manual" }
            ]}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Приоритет</label>
          <Select
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
            options={[
              { label: "Низкий", value: "low" },
              { label: "Средний", value: "medium" },
              { label: "Высокий", value: "high" }
            ]}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Срок</label>
          <Input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">ID диалога (необязательно)</label>
          <Input value={conversationId} onChange={(event) => setConversationId(event.target.value)} />
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="submit" disabled={disabled}>
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
        ) : null}
      </div>
    </form>
  );
}
