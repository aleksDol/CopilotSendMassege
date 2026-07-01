"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { useBillingSubscription, useTeam, useTeamActions } from "@/lib/hooks/use-app-data";

export default function TeamSettingsPage() {
  const team = useTeam();
  const subscription = useBillingSubscription();
  const actions = useTeamActions();

  const [error, setError] = useState<string | null>(null);

  if (team.isLoading || subscription.isLoading) {
    return <LoadingState label="Загрузка команды..." />;
  }

  if (team.isError || !team.data) {
    return <EmptyState title="Команда недоступна" description="Не удалось загрузить участников рабочего пространства." />;
  }

  const maxUsers = subscription.data?.limits.maxUsers ?? 1;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Команда</h1>
        <p className="text-sm text-muted-foreground">Список участников рабочего пространства.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Использование</CardTitle>
          <CardDescription>
            Участников: {team.data.members.length} / {maxUsers}
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Участники</CardTitle>
          <CardDescription>Активные пользователи в рабочем пространстве.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {team.data.members.length === 0 ? (
            <EmptyState title="Нет участников" description="Пока в рабочем пространстве только вы." />
          ) : (
            team.data.members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium">{member.fullName}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{member.role}</Badge>
                  {member.role !== "owner" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={actions.remove.isPending}
                      onClick={async () => {
                        setError(null);
                        try {
                          await actions.remove.mutateAsync(member.id);
                        } catch (removeError) {
                          setError(removeError instanceof Error ? removeError.message : "Не удалось удалить участника");
                        }
                      }}
                    >
                      Удалить
                    </Button>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
