"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils/date";
import { cn } from "@/lib/utils/cn";
import type { TaskItem } from "@/lib/api/types";

export function TaskList({
  items,
  onComplete,
  onReopen,
  onEdit,
  isMutating
}: {
  items: TaskItem[];
  onComplete: (id: string) => Promise<void>;
  onReopen: (id: string) => Promise<void>;
  onEdit: (item: TaskItem) => void;
  isMutating?: boolean;
}) {
  const now = Date.now();

  return (
    <div className="space-y-3">
      {items.map((task) => {
        const overdue = task.status === "open" && task.dueAt ? new Date(task.dueAt).getTime() < now : false;
        return (
          <Card key={task.id} className={cn(overdue ? "border-destructive/40" : "")}>
            <CardContent className="space-y-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{task.title}</div>
                  {task.description ? <p className="text-sm text-muted-foreground">{task.description}</p> : null}
                </div>
                <div className="flex flex-wrap gap-1">
                  <Badge variant={task.status === "completed" ? "success" : overdue ? "warning" : "outline"}>{task.status}</Badge>
                  <Badge variant="outline">{task.taskType}</Badge>
                  <Badge variant="outline">{task.priority}</Badge>
                  <Badge variant="outline">{task.source}</Badge>
                </div>
              </div>

              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>Срок: {task.dueAt ? formatDateTime(task.dueAt) : "-"}</span>
                <span>Исполнитель: {task.assignedUser?.fullName ?? "-"}</span>
                {task.conversation ? (
                  <span>
                    Диалог: <Link className="underline" href={`/chats?conversationId=${task.conversation.id}`}>{task.conversation.title ?? task.conversation.id}</Link>
                  </span>
                ) : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {task.status === "completed" ? (
                  <Button size="sm" variant="outline" disabled={isMutating} onClick={() => void onReopen(task.id)}>
                    Открыть снова
                  </Button>
                ) : (
                  <Button size="sm" disabled={isMutating} onClick={() => void onComplete(task.id)}>
                    Выполнено
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => onEdit(task)}>
                  Изменить
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
