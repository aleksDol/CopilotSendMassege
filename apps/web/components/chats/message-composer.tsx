"use client";

import { FormEvent, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function MessageComposer({
  value,
  onChange,
  onSend,
  isSending,
  sendDisabled = false,
  sendError = null,
  sendInfo = null
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => Promise<void>;
  isSending: boolean;
  sendDisabled?: boolean;
  sendError?: string | null;
  sendInfo?: string | null;
}) {
  const [localError, setLocalError] = useState<string | null>(null);
  const submittingRef = useRef(false);

  const displayError = sendError ?? localError;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError(null);
    if (submittingRef.current || isSending || sendDisabled) return;
    if (!value.trim()) {
      setLocalError("Сообщение не может быть пустым");
      return;
    }
    submittingRef.current = true;
    try {
      await onSend(value.trim());
    } finally {
      submittingRef.current = false;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="shrink-0 border-t border-border bg-card px-4 py-3">
      <div className="flex items-end gap-2">
        <Textarea
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Введите ответ..."
          rows={2}
          className="min-h-[44px] resize-none"
        />
        <Button type="submit" disabled={isSending || sendDisabled} className="h-10 shrink-0 px-4">
          {isSending ? "Отправка..." : "Отправить"}
        </Button>
      </div>
      {sendInfo ? <p className="text-xs text-muted-foreground">{sendInfo}</p> : null}
      {displayError ? <p className="text-xs text-destructive">{displayError}</p> : null}
    </form>
  );
}
