"use client";

import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { ReplyPolicyForm } from "@/components/settings/reply-policy-form";
import { useReplyPolicy, useSettingsActions } from "@/lib/hooks/use-app-data";

export default function ReplyPolicyPage() {
  const policy = useReplyPolicy();
  const actions = useSettingsActions();

  if (policy.isLoading) {
    return <LoadingState label="Загрузка политики ответов..." />;
  }

  if (policy.isError) {
    return (
      <EmptyState
        title="Политика ответов недоступна"
        description="Бэкенд не готов или вернул ошибку. Чаты можно использовать и без неё."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Политика ответов</h1>
        <p className="text-sm text-muted-foreground">Ограничения по ценам, тону, обещаниям и передаче клиента.</p>
      </div>

      <ReplyPolicyForm
        initial={policy.data?.policy}
        disabled={actions.saveReplyPolicy.isPending}
        onSubmit={async (payload) => {
          await actions.saveReplyPolicy.mutateAsync(payload);
        }}
      />
    </div>
  );
}
