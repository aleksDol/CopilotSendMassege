"use client";

import { TelegramConnectCard } from "@/components/settings/telegram-connect-card";
import { LoadingState } from "@/components/common/loading-state";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { useTelegramAccount, useTelegramAccounts, useTelegramActions } from "@/lib/hooks/use-app-data";

export default function TelegramSettingsPage() {
  const telegram = useTelegramAccount();
  const telegramAccounts = useTelegramAccounts();
  const actions = useTelegramActions();
  const hasAccounts = Boolean(telegramAccounts.data?.items?.length);

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
        connectButtonLabel={hasAccounts ? "Добавить ещё" : "Добавить аккаунт"}
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

      {!hasAccounts ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-4 text-sm text-muted-foreground">
          Telegram-аккаунты не подключены.
        </div>
      ) : null}

      {hasAccounts ? (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Роли аккаунтов</h2>
          {telegramAccounts.data?.items?.map((account) => {
            const channelAccountId = account.channelAccountId;
            if (!channelAccountId) return null;
            const sendingEnabled = account.sendingEnabled !== false;
            const parsingEnabled = account.parsingEnabled !== false;
            const disableSendingToggle = !parsingEnabled;
            const disableParsingToggle = !sendingEnabled;
            return (
              <div key={account.channelAccountId} className="rounded-lg border border-border p-3">
                <div className="mb-3 text-sm font-medium">
                  {account.displayName ?? "Telegram account"} {account.username ? `(@${account.username})` : ""}
                </div>
                <div className="flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={sendingEnabled}
                      disabled={actions.patchAccountFlags.isPending || disableSendingToggle}
                      onCheckedChange={(checked) =>
                        void actions.patchAccountFlags.mutateAsync({
                          channelAccountId,
                          sendingEnabled: Boolean(checked)
                        })
                      }
                    />
                    Письма
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={parsingEnabled}
                      disabled={actions.patchAccountFlags.isPending || disableParsingToggle}
                      onCheckedChange={(checked) =>
                        void actions.patchAccountFlags.mutateAsync({
                          channelAccountId,
                          parsingEnabled: Boolean(checked)
                        })
                      }
                    />
                    Парсинг
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={actions.patchAccountFlags.isPending}
                    onClick={() =>
                      void actions.patchAccountFlags.mutateAsync({
                        channelAccountId,
                        sendingEnabled: true,
                        parsingEnabled: true
                      })
                    }
                  >
                    Включить оба
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
