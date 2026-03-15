"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { KnowledgeItem } from "@/lib/api/types";

export function KnowledgeItemForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
  disabled
}: {
  initial?: KnowledgeItem;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (payload: { kind: string; title: string; content: string; priority: number; isActive: boolean }) => Promise<void>;
  disabled?: boolean;
}) {
  const [kind, setKind] = useState("faq");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [priority, setPriority] = useState("50");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setKind(initial?.kind ?? "faq");
    setTitle(initial?.title ?? "");
    setContent(initial?.content ?? "");
    setPriority(String(initial?.priority ?? 50));
    setIsActive(initial?.isActive ?? true);
  }, [initial]);

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await onSubmit({ kind, title, content, priority: Number(priority) || 50, isActive });
      }}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Тип</label>
          <Select
            value={kind}
            onChange={(event) => setKind(event.target.value)}
            options={[
              { label: "Описание продукта", value: "product_description" },
              { label: "FAQ", value: "faq" },
              { label: "Правила ценообразования", value: "pricing_rules" },
              { label: "Скрипт продаж", value: "sales_script" },
              { label: "Работа с возражениями", value: "objection_handling" },
              { label: "Тон общения", value: "tone_of_voice" },
              { label: "Кейс", value: "case" }
            ]}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Приоритет</label>
          <Input type="number" value={priority} onChange={(event) => setPriority(event.target.value)} />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Название</label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
      </div>

      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Содержание</label>
        <Textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} required />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={isActive} onCheckedChange={setIsActive} />
        Активен
      </label>

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
