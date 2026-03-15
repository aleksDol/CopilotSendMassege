"use client";

import { FormEvent, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { useBillingSubscription, useTeam, useTeamActions } from "@/lib/hooks/use-app-data";

export default function TeamSettingsPage() {
  const team = useTeam();
  const subscription = useBillingSubscription();
  const actions = useTeamActions();

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (team.isLoading || subscription.isLoading) {
    return <LoadingState label="Загрузка команды..." />;
  }

  if (team.isError || !team.data) {
    return <EmptyState title="Команда недоступна" description="Не удалось загрузить участников рабочего пространства." />;
  }

  const maxUsers = subscription.data?.limits.maxUsers ?? 1;

  const onInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInviteLink(null);

    try {
      const response = await actions.invite.mutateAsync({ email, role });
      setInviteLink(response.invite.inviteLink ?? null);
      setEmail("");
      setRole("member");
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Не удалось создать приглашение");
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Команда</h1>
        <p className="text-sm text-muted-foreground">Приглашайте участников и управляйте доступом в рабочем пространстве.</p>
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
          <CardTitle>Пригласить участника</CardTitle>
          <CardDescription>Создайте ссылку-приглашение и отправьте коллеге.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-2 md:grid-cols-[1fr_180px_auto]" onSubmit={onInvite}>
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="email@company.com" required />
            <Select
              value={role}
              onChange={(event) => setRole(event.target.value as "member" | "admin")}
              options={[
                { label: "Участник", value: "member" },
                { label: "Админ", value: "admin" }
              ]}
            />
            <Button disabled={actions.invite.isPending}>{actions.invite.isPending ? "Отправка..." : "Пригласить"}</Button>
          </form>

          {inviteLink ? (
            <div className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-sm">
              <div className="text-xs uppercase text-muted-foreground">Ссылка для приглашения</div>
              <div className="mt-1 break-all">{inviteLink}</div>
            </div>
          ) : null}

          {error ? <p className="mt-2 text-sm text-destructive">{error}</p> : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Участники</CardTitle>
          <CardDescription>Активные пользователи в рабочем пространстве.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {team.data.members.length === 0 ? (
            <EmptyState title="Нет участников" description="Пригласите первого участника с помощью формы выше." />
          ) : (
            team.data.members.map((member) => (
              <div key={member.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3">
                <div>
                  <div className="font-medium">{member.fullName}</div>
                  <div className="text-sm text-muted-foreground">{member.email}</div>
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

      <Card>
        <CardHeader>
          <CardTitle>Ожидающие приглашения</CardTitle>
          <CardDescription>Приглашения, которые ещё не приняты.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {team.data.invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">Нет ожидающих приглашений.</p>
          ) : (
            team.data.invites.map((invite) => (
              <div key={invite.id} className="rounded-lg border border-border p-3 text-sm">
                <div className="font-medium">{invite.email}</div>
                <div className="text-muted-foreground">роль: {invite.role}</div>
                <div className="text-muted-foreground">истекает: {new Date(invite.expiresAt).toLocaleDateString()}</div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
