"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({
  value,
  onChange,
  onSend,
  isSending
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => Promise<void>;
  isSending: boolean;
}) {
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);

    if (!value.trim()) {
      setLocalError("Сообщение не может быть пустым");
      return;
    }

    await onSend(value.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border bg-card p-3">
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Введите ответ..." rows={3} />
      {localError ? <p className="text-xs text-destructive">{localError}</p> : null}
      <div className="flex justify-end">
        <Button disabled={isSending}>{isSending ? "Отправка..." : "Отправить"}</Button>
      </div>
    </form>
  );
}
