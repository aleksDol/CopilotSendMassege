"use client";

import { TelegramConnectCard } from "@/components/settings/telegram-connect-card";
import { LoadingState } from "@/components/common/loading-state";
import { useTelegramAccount, useTelegramActions } from "@/lib/hooks/use-app-data";

export default function TelegramSettingsPage() {
  const telegram = useTelegramAccount();
  const actions = useTelegramActions();

  if (telegram.isLoading) {
    return <LoadingState label="Загрузка статуса Telegram..." />;
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Подключение Telegram</h1>
        <p className="text-sm text-muted-foreground">Подключите и синхронизируйте личный или рабочий аккаунт Telegram.</p>
      </div>

      <TelegramConnectCard
        account={telegram.data}
        loading={
          actions.startConnect.isPending ||
          actions.verifyCode.isPending ||
          actions.verifyPassword.isPending ||
          actions.sync.isPending
        }
        onStart={(phone) => actions.startConnect.mutateAsync(phone)}
        onVerifyCode={(phone, code) => actions.verifyCode.mutateAsync({ phone, code })}
        onVerifyPassword={(phone, password) => actions.verifyPassword.mutateAsync({ phone, password })}
        onSync={async () => {
          await actions.sync.mutateAsync();
        }}
      />
    </div>
  );
}
