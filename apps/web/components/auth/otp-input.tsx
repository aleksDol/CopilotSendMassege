"use client";

import { useEffect, useMemo, useRef } from "react";
import { cn } from "@/lib/utils/cn";

type OtpInputProps = {
  value: string;
  length?: number;
  disabled?: boolean;
  hasError?: boolean;
  autoFocus?: boolean;
  onChange: (nextValue: string) => void;
  onComplete?: (value: string) => void;
  ariaLabel?: string;
};

const DIGITS_ONLY = /\D/g;

export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled = false,
  hasError = false,
  autoFocus = false,
  ariaLabel = "Код подтверждения"
}: OtpInputProps) {
  const normalized = useMemo(() => value.replace(DIGITS_ONLY, "").slice(0, length), [length, value]);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autoFocus && !disabled) {
      refs.current[0]?.focus();
    }
  }, [autoFocus, disabled]);

  useEffect(() => {
    if (normalized.length === length) {
      onComplete?.(normalized);
    }
  }, [length, normalized, onComplete]);

  const setValueAt = (index: number, char: string) => {
    const chars = normalized.padEnd(length, " ").split("");
    chars[index] = char;
    const next = chars.join("").replace(/\s/g, "");
    onChange(next);
  };

  const focusAt = (index: number) => {
    if (index < 0 || index >= length) return;
    refs.current[index]?.focus();
    refs.current[index]?.select();
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(DIGITS_ONLY, "").slice(0, length);
    if (!pasted) return;
    onChange(pasted);
    focusAt(Math.min(pasted.length, length - 1));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Код подтверждения</label>
        <span className="text-xs text-muted-foreground">6 цифр</span>
      </div>
      <div className="grid grid-cols-6 gap-2 sm:gap-3" role="group" aria-label={ariaLabel}>
        {Array.from({ length }).map((_, index) => {
          const char = normalized[index] ?? "";
          return (
            <input
              key={index}
              ref={(node) => {
                refs.current[index] = node;
              }}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={1}
              value={char}
              disabled={disabled}
              aria-label={`Цифра ${index + 1}`}
              onPaste={handlePaste}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const nextChar = event.target.value.replace(DIGITS_ONLY, "").slice(-1);
                if (!nextChar) {
                  setValueAt(index, "");
                  return;
                }
                setValueAt(index, nextChar);
                focusAt(index + 1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Backspace") {
                  if (char) {
                    setValueAt(index, "");
                    return;
                  }
                  focusAt(index - 1);
                  return;
                }
                if (event.key === "ArrowLeft") {
                  event.preventDefault();
                  focusAt(index - 1);
                  return;
                }
                if (event.key === "ArrowRight") {
                  event.preventDefault();
                  focusAt(index + 1);
                }
              }}
              className={cn(
                "h-12 w-full rounded-xl border bg-background text-center text-lg font-semibold tracking-[0.08em] outline-none transition-all",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-60",
                hasError ? "border-destructive/60 focus-visible:ring-destructive/40 focus-visible:border-destructive" : "border-border"
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
