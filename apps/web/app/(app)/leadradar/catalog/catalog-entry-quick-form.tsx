"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "@/lib/api/errors";
import { leadradarApi } from "@/lib/api/leadradar";
import {
  sourceMarketplaceApi,
  type SourceMarketplaceEntryItem,
  type SourceMarketplaceTopicItem
} from "@/lib/api/source-marketplace";
import { useSelectedLeadRadarParsingChannelAccountId } from "@/lib/hooks/use-app-data";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  formatChatTypeLabel,
  isCatalogEntryDuplicate,
  mapResolveError,
  parseTelegramUsernameFromLink,
  type ResolvedChatPreview
} from "./catalog-entry-helpers";

type CatalogEntryQuickFormProps = {
  token: string;
  topics: SourceMarketplaceTopicItem[];
  entries: SourceMarketplaceEntryItem[];
  onCreated: () => Promise<void>;
};

export function CatalogEntryQuickForm({ token, topics, entries, onCreated }: CatalogEntryQuickFormProps) {
  const { selectedLeadRadarParsingChannelAccountId: parsingChannelAccountId } =
    useSelectedLeadRadarParsingChannelAccountId();

  const [link, setLink] = useState("");
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const [resolved, setResolved] = useState<ResolvedChatPreview | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  const resolveRequestId = useRef(0);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showSuccessToast = useCallback((message: string) => {
    setSuccessToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setSuccessToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  const resolveLink = useCallback(
    async (rawLink: string) => {
      const trimmed = rawLink.trim();
      if (!trimmed || !token) {
        setResolved(null);
        setResolveError(null);
        return;
      }

      const usernameFromLink = parseTelegramUsernameFromLink(trimmed);
      if (!usernameFromLink && !trimmed.includes("t.me") && !trimmed.startsWith("@")) {
        setResolved(null);
        setResolveError("Не удалось получить информацию о чате. Проверьте ссылку.");
        return;
      }

      if (!parsingChannelAccountId) {
        setResolved(null);
        setResolveError("Подключите рабочий Telegram в настройках аккаунта.");
        return;
      }

      const requestId = ++resolveRequestId.current;
      setResolving(true);
      setResolveError(null);
      setResolved(null);

      try {
        const result = await leadradarApi.addSourceByLink(
          token,
          { link: trimmed },
          parsingChannelAccountId || undefined
        );

        if (requestId !== resolveRequestId.current) return;

        setResolved({
          telegramChatId: result.telegram_chat_id,
          title: result.chat_title?.trim() || usernameFromLink || result.telegram_chat_id,
          chatType: result.chat_type ?? "group",
          username: usernameFromLink
        });
      } catch (error) {
        if (requestId !== resolveRequestId.current) return;
        setResolveError(mapResolveError(error));
      } finally {
        if (requestId === resolveRequestId.current) {
          setResolving(false);
        }
      }
    },
    [token, parsingChannelAccountId]
  );

  useEffect(() => {
    const trimmed = link.trim();
    if (!trimmed) {
      setResolved(null);
      setResolveError(null);
      setResolving(false);
      resolveRequestId.current += 1;
      return;
    }

    const timer = setTimeout(() => {
      void resolveLink(trimmed);
    }, 500);

    return () => clearTimeout(timer);
  }, [link, resolveLink]);

  const handleSubmit = async () => {
    if (!token || !resolved || topicIds.length === 0) return;

    if (isCatalogEntryDuplicate(entries, resolved.telegramChatId, resolved.username)) {
      setSubmitError("Этот источник уже есть в каталоге.");
      return;
    }

    setSaving(true);
    setSubmitError(null);

    try {
      await sourceMarketplaceApi.createEntry(token, {
        title: resolved.title.trim().slice(0, 255),
        telegramUsername: resolved.username,
        telegramChatId: resolved.telegramChatId,
        chatType: resolved.chatType,
        lastCheckedAt: new Date().toISOString(),
        topicIds
      });

      showSuccessToast("✅ Источник добавлен.");
      setLink("");
      setTopicIds([]);
      setResolved(null);
      setResolveError(null);
      await onCreated();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : "Не удалось добавить источник");
    } finally {
      setSaving(false);
    }
  };

  const canSubmit = Boolean(resolved && topicIds.length > 0 && !resolving && !saving);

  return (
    <>
      {successToast ? (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 rounded-lg border border-border bg-background px-4 py-3 text-sm shadow-lg"
        >
          {successToast}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Добавить источник</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="grid gap-1 text-sm">
            <span className="text-muted-foreground">Ссылка на Telegram-чат</span>
            <input
              value={link}
              onChange={(e) => {
                setLink(e.target.value);
                setSubmitError(null);
              }}
              placeholder="https://t.me/wolf_vakansii или @wolf_vakansii"
              className="h-10 rounded-md border border-border bg-background px-3"
              autoComplete="off"
            />
          </label>

          {resolving ? <p className="text-sm text-muted-foreground">Получаем информацию о чате...</p> : null}

          {resolveError ? (
            <p className="text-sm text-destructive" role="alert">
              {resolveError}
            </p>
          ) : null}

          {resolved && !resolving ? (
            <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{resolved.title}</p>
              <p className="text-muted-foreground">Тип: {formatChatTypeLabel(resolved.chatType)}</p>
              <p className="text-muted-foreground">
                Username: {resolved.username ? `@${resolved.username}` : "—"}
              </p>
            </div>
          ) : null}

          <fieldset className="grid gap-2">
            <legend className="text-sm text-muted-foreground">Тематики</legend>
            {topics.length === 0 ? (
              <p className="text-sm text-muted-foreground">Сначала создайте тематики.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {topics.map((topic) => {
                  const checked = topicIds.includes(topic.id);
                  return (
                    <label key={topic.id} className="inline-flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => {
                          setTopicIds((prev) =>
                            value ? [...prev, topic.id] : prev.filter((id) => id !== topic.id)
                          );
                        }}
                      />
                      {topic.name}
                    </label>
                  );
                })}
              </div>
            )}
          </fieldset>

          {submitError ? (
            <p className="text-sm text-destructive" role="alert">
              {submitError}
            </p>
          ) : null}

          <Button disabled={!canSubmit} onClick={() => void handleSubmit()}>
            {saving ? "Добавляем…" : "Добавить источник"}
          </Button>
        </CardContent>
      </Card>
    </>
  );
}
