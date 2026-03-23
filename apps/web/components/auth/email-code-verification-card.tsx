"use client";

import { Button } from "@/components/ui/button";
import { OtpInput } from "./otp-input";

type EmailCodeVerificationCardProps = {
  email: string;
  code: string;
  isSubmitting: boolean;
  error?: string | null;
  info?: string | null;
  resendIn: number;
  ctaText: string;
  backText?: string;
  onCodeChange: (value: string) => void;
  onBack: () => void;
  onResend: () => Promise<void> | void;
};

const formatCooldown = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
};

export function EmailCodeVerificationCard({
  email,
  code,
  isSubmitting,
  error,
  info,
  resendIn,
  ctaText,
  backText = "Изменить email",
  onCodeChange,
  onBack,
  onResend
}: EmailCodeVerificationCardProps) {
  const canSubmit = code.length === 6 && !isSubmitting;
  const canResend = resendIn === 0 && !isSubmitting;

  return (
    <div className="space-y-6 rounded-2xl border border-border/70 bg-gradient-to-b from-background to-muted/20 p-4 sm:p-6">
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Введите код подтверждения</h2>
        <p className="text-sm text-muted-foreground">
          Мы отправили 6-значный код на <span className="font-medium text-foreground">{email}</span>
        </p>
      </div>

      <OtpInput
        value={code}
        onChange={onCodeChange}
        autoFocus
        disabled={isSubmitting}
        hasError={Boolean(error)}
        ariaLabel="Поле ввода кода подтверждения"
      />

      {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p> : null}
      {!error && info ? <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">{info}</p> : null}

      <div className="space-y-3">
        <Button className="h-11 w-full rounded-xl text-sm font-semibold" disabled={!canSubmit} type="submit">
          {isSubmitting ? "Проверяем код..." : ctaText}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="text-muted-foreground transition-colors hover:text-foreground"
            onClick={onBack}
            disabled={isSubmitting}
          >
            {backText}
          </button>

          <button
            type="button"
            className="text-primary underline-offset-4 transition-colors hover:underline disabled:text-muted-foreground"
            disabled={!canResend}
            onClick={onResend}
          >
            {canResend ? "Отправить код повторно" : `Повторная отправка через ${formatCooldown(resendIn)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
