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
          actions.startConnectQr.isPending ||
          actions.pollLoginQr.isPending ||
          actions.verifyPasswordQr.isPending ||
          actions.sync.isPending ||
          actions.logout.isPending
        }
        onStartQr={() => actions.startConnectQr.mutateAsync()}
        onPollQr={(qrSessionId) => actions.pollLoginQr.mutateAsync(qrSessionId)}
        onVerifyPasswordQr={(payload) => actions.verifyPasswordQr.mutateAsync(payload)}
        onSync={async () => {
          await actions.sync.mutateAsync();
        }}
        onLogout={async () => {
          await actions.logout.mutateAsync();
        }}
      />
    </div>
  );
}
