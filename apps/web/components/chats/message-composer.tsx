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
  sendError = null
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: (text: string) => Promise<void>;
  isSending: boolean;
  sendDisabled?: boolean;
  sendError?: string | null;
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
    <form onSubmit={handleSubmit} className="space-y-2 rounded-lg border border-border bg-card p-3">
      <Textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder="Введите ответ..." rows={3} />
      {displayError ? <p className="text-xs text-destructive">{displayError}</p> : null}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={isSending || sendDisabled}
        >
          {isSending ? "Отправка..." : "Отправить"}
        </Button>
      </div>
    </form>
  );
}
