"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { LeadRadarNav } from "@/components/leadradar/leadradar-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/errors";
import type { LeadRadarAiSetupKeywordGroup, LeadRadarAiSetupPreviewResponse, TelegramAccountResponse } from "@/lib/api/types";
import {
  useLeadRadarAiSetupGenerate,
  useLeadRadarConfigActions,
  useSelectedLeadRadarParsingChannelAccountId
} from "@/lib/hooks/use-app-data";
import { cn } from "@/lib/utils/cn";
import { saveMarketplaceSetupContext } from "@/lib/leadradar/marketplace-setup-context";

const MIN_DESCRIPTION_LENGTH = 3;

/** Stored for API/DB compatibility; does not affect matching or scoring. */
const DEFAULT_KEYWORD_CATEGORY = "general" as const;

type KeywordEntry = {
  id: string;
  keyword: string;
  groupTitle: string;
};

function buildKeywordEntries(groups: LeadRadarAiSetupKeywordGroup[]): KeywordEntry[] {
  const entries: KeywordEntry[] = [];
  for (const group of groups) {
    for (const keyword of group.keywords) {
      entries.push({
        id: `${group.title}::${keyword}`,
        keyword,
        groupTitle: group.title
      });
    }
  }
  return entries;
}

function getAiSetupErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "AI_UNAVAILABLE") {
      return "ИИ сейчас недоступен. Администратору нужно настроить OPENAI_API_KEY на сервере.";
    }
    if (error.code === "LEADRADAR_NOT_AVAILABLE") {
      return "LeadRadar отключён на этом окружении. Обратитесь к администратору.";
    }
    if (error.code === "AI_SETUP_GENERATION_FAILED") {
      return "Не удалось сгенерировать настройки. Попробуйте переформулировать описание и повторить.";
    }
    if (error.status === 429) {
      return "Слишком много запросов. Подождите минуту и попробуйте снова.";
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Не удалось получить preview от ИИ.";
}

function PreviewChipList({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item}>
          <Badge variant="secondary" className="whitespace-normal font-normal">
            {item}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function KeywordGroupCard({
  group,
  selectedKeywordIds,
  onToggleKeyword
}: {
  group: LeadRadarAiSetupKeywordGroup;
  selectedKeywordIds: Set<string>;
  onToggleKeyword: (id: string, checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const count = group.keywords.length;
  const countLabel =
    count === 0 ? "фраз не найдено" : count === 1 ? "1 фраза" : count < 5 ? `${count} фразы` : `${count} фраз`;
  const selectedInGroup = group.keywords.filter((keyword) => selectedKeywordIds.has(`${group.title}::${keyword}`)).length;

  return (
    <article className="rounded-lg border border-border bg-background">
      <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h4 className="font-medium">{group.title}</h4>
          <p className="text-sm text-muted-foreground">{group.description}</p>
          <p className="text-xs text-muted-foreground">
            {countLabel}
            {count > 0 ? ` · выбрано ${selectedInGroup}` : null}
          </p>
        </div>
        {count > 0 ? (
          <Button variant="outline" size="sm" className="shrink-0" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Скрыть" : "Показать"}
          </Button>
        ) : null}
      </div>
      {expanded && count > 0 ? (
        <div className="space-y-2 border-t border-border px-4 pb-4 pt-3">
          {group.keywords.map((keyword) => {
            const id = `${group.title}::${keyword}`;
            const checked = selectedKeywordIds.has(id);
            return (
              <label key={id} className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={checked}
                  onCheckedChange={(value) => onToggleKeyword(id, value)}
                  className="mt-0.5"
                />
                <span className={cn("leading-snug", !checked && "text-muted-foreground")}>{keyword}</span>
              </label>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}

function PreviewSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg border border-border bg-muted/20 p-4">
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </section>
  );
}

export default function LeadRadarSetupPage() {
  const router = useRouter();
  const generate = useLeadRadarAiSetupGenerate();
  const actions = useLeadRadarConfigActions();
  const {
    selectedLeadRadarParsingChannelAccountId,
    setSelectedLeadRadarParsingChannelAccountId,
    parsingAccounts
  } = useSelectedLeadRadarParsingChannelAccountId();

  const [description, setDescription] = useState("");
  const [preview, setPreview] = useState<LeadRadarAiSetupPreviewResponse | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [extrasOpen, setExtrasOpen] = useState(false);
  const [selectedKeywordIds, setSelectedKeywordIds] = useState<Set<string>>(() => new Set());
  const [applyResult, setApplyResult] = useState<{ createdCount: number; skippedCount: number } | null>(null);

  const keywordEntries = useMemo(
    () => (preview ? buildKeywordEntries(preview.keywordGroups) : []),
    [preview]
  );

  useEffect(() => {
    if (!preview) {
      setSelectedKeywordIds(new Set());
      return;
    }
    setSelectedKeywordIds(new Set(keywordEntries.map((entry) => entry.id)));
  }, [preview, keywordEntries]);

  const parsingAccountOptions = parsingAccounts
    .filter((account: TelegramAccountResponse) => Boolean(account.channelAccountId))
    .map((account: TelegramAccountResponse) => ({
      value: String(account.channelAccountId),
      label: account.displayName?.trim() ? account.displayName : `Account ${String(account.channelAccountId).slice(0, 8)}`
    }));

  const trimmedDescription = description.trim();
  const isTooShort = trimmedDescription.length > 0 && trimmedDescription.length < MIN_DESCRIPTION_LENGTH;
  const canSubmit = trimmedDescription.length >= MIN_DESCRIPTION_LENGTH && !generate.isPending;

  const selectedKeywords = useMemo(
    () => keywordEntries.filter((entry) => selectedKeywordIds.has(entry.id)),
    [keywordEntries, selectedKeywordIds]
  );

  const canApply =
    Boolean(preview) &&
    selectedKeywords.length > 0 &&
    Boolean(selectedLeadRadarParsingChannelAccountId) &&
    !actions.bulkAddKeywords.isPending;

  const apiError = useMemo(() => {
    if (!generate.error) return null;
    return getAiSetupErrorMessage(generate.error);
  }, [generate.error]);

  const totalKeywords = keywordEntries.length;

  const handleToggleKeyword = (id: string, checked: boolean) => {
    setApplyResult(null);
    setApplyError(null);
    setSelectedKeywordIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const handleGenerate = async () => {
    setClientError(null);
    setApplyError(null);
    setApplyResult(null);
    setPreview(null);
    setExtrasOpen(false);

    if (trimmedDescription.length < MIN_DESCRIPTION_LENGTH) {
      setClientError(`Опишите бизнес чуть подробнее — минимум ${MIN_DESCRIPTION_LENGTH} символа.`);
      return;
    }

    try {
      const result = await generate.mutateAsync({ description: trimmedDescription });
      setPreview(result);
    } catch {
      // error surfaced via generate.error
    }
  };

  const handleApply = async () => {
    setApplyError(null);
    setApplyResult(null);

    if (!selectedLeadRadarParsingChannelAccountId) {
      setApplyError("Выберите аккаунт для парсинга — без него ключевые слова не сохранятся.");
      return;
    }

    if (!selectedKeywords.length) {
      setApplyError("Выберите хотя бы одну поисковую фразу.");
      return;
    }

    try {
      const result = await actions.bulkAddKeywords.mutateAsync({
        channelAccountId: selectedLeadRadarParsingChannelAccountId,
        keywords: selectedKeywords.map((entry) => ({
          keyword: entry.keyword,
          matchType: "contains",
          target: "message",
          category: DEFAULT_KEYWORD_CATEGORY,
          priority: 1
        }))
      });
      setApplyResult(result);
      saveMarketplaceSetupContext({
        chatTopics: preview?.chatTopics ?? [],
        keywordCount: selectedKeywords.length
      });
      router.push("/leadradar/marketplace");
    } catch (error) {
      if (error instanceof ApiError) {
        setApplyError(error.message);
      } else if (error instanceof Error) {
        setApplyError(error.message);
      } else {
        setApplyError("Не удалось сохранить ключевые слова.");
      }
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-primary" aria-hidden />
          <h1 className="text-2xl font-semibold">AI настройка LeadRadar</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          Опишите, чем вы занимаетесь — ИИ предложит поисковые фразы по группам и тематики чатов. Выберите фразы и
          примените их к аккаунту для парсинга.
        </p>
        <LeadRadarNav />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Шаг 1 — Описание бизнеса</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="business-description" className="text-sm font-medium">
              Опишите, чем вы занимаетесь
            </label>
            <Textarea
              id="business-description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                setClientError(null);
              }}
              placeholder="Например: Делаю сайты для малого бизнеса."
              rows={4}
              disabled={generate.isPending}
            />
            {isTooShort ? (
              <p className="text-sm text-destructive">
                Слишком короткое описание — нужно минимум {MIN_DESCRIPTION_LENGTH} символа.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button disabled={!canSubmit} onClick={() => void handleGenerate()}>
              {generate.isPending ? "Подбираем..." : "Подобрать настройки"}
            </Button>
            {preview ? (
              <Button
                variant="outline"
                disabled={generate.isPending}
                onClick={() => {
                  setPreview(null);
                  setClientError(null);
                  setApplyError(null);
                  setApplyResult(null);
                  setExtrasOpen(false);
                  generate.reset();
                }}
              >
                Сбросить preview
              </Button>
            ) : null}
          </div>

          {clientError ? <p className="text-sm text-destructive">{clientError}</p> : null}
        </CardContent>
      </Card>

      {generate.isPending ? (
        <LoadingState label="ИИ подбирает поисковые фразы и тематики..." />
      ) : null}

      {apiError ? <EmptyState title="Не удалось подобрать настройки" description={apiError} /> : null}

      {preview && !generate.isPending ? (
        <Card>
          <CardHeader>
            <CardTitle>Preview — что предлагает ИИ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <PreviewSection title="Ниша">
              <p className="text-sm leading-relaxed">{preview.niche}</p>
            </PreviewSection>

            <PreviewSection title="Кратко">
              <p className="text-sm leading-relaxed text-muted-foreground">{preview.summary}</p>
            </PreviewSection>

            <section className="space-y-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold">Поисковые фразы по группам</h3>
                <span className="text-xs text-muted-foreground">
                  Всего: {totalKeywords} · выбрано: {selectedKeywords.length}
                </span>
              </div>
              <div className="grid gap-3">
                {preview.keywordGroups.map((group) => (
                  <KeywordGroupCard
                    key={group.title}
                    group={group}
                    selectedKeywordIds={selectedKeywordIds}
                    onToggleKeyword={handleToggleKeyword}
                  />
                ))}
              </div>
            </section>

            <PreviewSection title="Тематики чатов">
              {preview.chatTopics.length ? (
                <PreviewChipList items={preview.chatTopics} />
              ) : (
                <p className="text-sm text-muted-foreground">ИИ не предложил тематики чатов.</p>
              )}
              <p className="text-xs text-muted-foreground">Тематики чатов пока не сохраняются — только preview.</p>
            </PreviewSection>

            <section className="rounded-lg border border-border">
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left text-sm font-medium"
                onClick={() => setExtrasOpen((v) => !v)}
              >
                <span>Дополнительно</span>
                <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", extrasOpen && "rotate-180")} />
              </button>
              {extrasOpen ? (
                <div className="space-y-2 border-t border-border px-4 pb-4 pt-3">
                  <h4 className="text-sm font-medium">Минус-слова</h4>
                  {preview.negativeKeywords.length ? (
                    <PreviewChipList items={preview.negativeKeywords} />
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Минус-слова не предложены — это нормально для некоторых ниш.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Минус-слова пока не сохраняются — только preview.</p>
                </div>
              ) : null}
            </section>

            <section className="space-y-4 rounded-lg border border-border bg-muted/20 p-4">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold">Шаг 2 — Применить ключевые слова</h3>
                <p className="text-sm text-muted-foreground">
                  Выбранные фразы будут добавлены в LeadRadar для выбранного аккаунта парсинга. Дубликаты пропускаются
                  автоматически.
                </p>
              </div>

              {parsingAccountOptions.length ? (
                <div className="max-w-md space-y-1">
                  <label htmlFor="parsing-account" className="text-xs text-muted-foreground">
                    Аккаунт для парсинга
                  </label>
                  <Select
                    id="parsing-account"
                    value={selectedLeadRadarParsingChannelAccountId}
                    onChange={(event) => {
                      setSelectedLeadRadarParsingChannelAccountId(event.target.value);
                      setApplyResult(null);
                      setApplyError(null);
                    }}
                    options={parsingAccountOptions}
                  />
                </div>
              ) : (
                <p className="text-sm text-destructive">
                  Нет аккаунтов с включённым парсингом. Подключите Telegram и включите парсинг в настройках аккаунта.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-3">
                <Button disabled={!canApply} onClick={() => void handleApply()}>
                  {actions.bulkAddKeywords.isPending ? "Сохраняем..." : "Применить настройки"}
                </Button>
                {!selectedLeadRadarParsingChannelAccountId && parsingAccountOptions.length ? (
                  <p className="text-sm text-destructive">Выберите аккаунт для парсинга.</p>
                ) : null}
              </div>

              {applyError ? <p className="text-sm text-destructive">{applyError}</p> : null}

              {applyResult ? (
                <div className="space-y-1 rounded-md border border-border bg-background p-3 text-sm">
                  <p>
                    Добавлено {applyResult.createdCount} фраз, пропущено дублей {applyResult.skippedCount}. Переходим к
                    выбору источников…
                  </p>
                </div>
              ) : null}
            </section>
          </CardContent>
        </Card>
      ) : null}

      {!preview && !generate.isPending && !apiError ? (
        <EmptyState
          title="Preview появится здесь"
          description="Введите описание бизнеса и нажмите «Подобрать настройки», чтобы увидеть нишу, группы фраз и тематики."
        />
      ) : null}
    </div>
  );
}
