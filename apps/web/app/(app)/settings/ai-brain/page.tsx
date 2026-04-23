"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { KnowledgeItemForm } from "@/components/settings/knowledge-item-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useKnowledgeItems, useLeadRadarConfigActions, useLeadRadarSettings, useReplyPolicy, useSettingsActions } from "@/lib/hooks/use-app-data";
import type { KnowledgeItem, ReplyPolicy } from "@/lib/api/types";

const AI_BRAIN_PRODUCT_TITLE = "AI Brain Product";
const AI_BRAIN_GOAL_KEY = "aiBrainGoal";
const AI_BRAIN_STRATEGY_KEY = "aiBrainStrategy";
const AI_BRAIN_COLD_FIRST_TOUCH_KEY = "aiBrainColdFirstTouch";

const STRATEGY_TEMPLATES = [
  {
    id: "seller",
    label: "Продавец",
    value:
      "Ведите клиента от интереса к действию: уточняйте потребность, говорите о пользе простыми словами, отрабатывайте возражения и мягко ведите к следующему шагу."
  },
  {
    id: "consultant",
    label: "Консультант",
    value:
      "Действуйте как эксперт-консультант: сначала задайте уточняющие вопросы, затем предложите подходящее решение и следующий конкретный шаг."
  },
  {
    id: "soft",
    label: "Мягкий",
    value:
      "Поддерживайте теплый и спокойный тон без давления: понятно объясняйте, помогайте разобраться и аккуратно подводите к следующему шагу."
  },
  {
    id: "direct",
    label: "Прямой",
    value:
      "Отвечайте кратко и по делу: быстро переходите к сути, задавайте только ключевые вопросы и ведите к конкретному действию."
  }
] as const;

type KnowledgeGroup = {
  id: "faq" | "case" | "script" | "policy" | "features";
  title: string;
  hint: string;
  empty: string;
  match: (item: KnowledgeItem, primaryProductId: string | null) => boolean;
};

const KNOWLEDGE_GROUPS: KnowledgeGroup[] = [
  {
    id: "faq",
    title: "FAQ",
    hint: "Частые вопросы клиентов",
    empty: "Нет блоков FAQ",
    match: (item) => item.kind === "faq"
  },
  {
    id: "case",
    title: "Кейсы",
    hint: "Примеры и результаты",
    empty: "Нет блоков с кейсами",
    match: (item) => item.kind === "case"
  },
  {
    id: "script",
    title: "Возражения",
    hint: "Как отвечать на сомнения",
    empty: "Нет блоков с возражениями",
    match: (item) => item.kind === "script"
  },
  {
    id: "policy",
    title: "Цены",
    hint: "Тарифы и условия",
    empty: "Нет блоков с ценами",
    match: (item) => item.kind === "policy"
  },
  {
    id: "features",
    title: "Функции",
    hint: "Возможности продукта",
    empty: "Нет блоков с функциями",
    match: (item, primaryProductId) => item.kind === "product" && item.id !== primaryProductId
  }
];

const toneRulesToObject = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return { legacyToneRules: value };
  }
  return {};
};

const readAiBrainValues = (policy: ReplyPolicy | undefined): { goal: string; strategy: string } => {
  const toneRules = policy?.toneRules;
  if (toneRules && typeof toneRules === "object" && !Array.isArray(toneRules)) {
    const record = toneRules as Record<string, unknown>;
    const goal = typeof record[AI_BRAIN_GOAL_KEY] === "string" ? String(record[AI_BRAIN_GOAL_KEY]) : "";
    const strategy = typeof record[AI_BRAIN_STRATEGY_KEY] === "string" ? String(record[AI_BRAIN_STRATEGY_KEY]) : "";
    return { goal, strategy };
  }
  if (typeof toneRules === "string") {
    return { goal: "", strategy: toneRules };
  }
  return { goal: "", strategy: "" };
};

const kindByGroup = (groupId: KnowledgeGroup["id"]): string => {
  switch (groupId) {
    case "faq":
      return "faq";
    case "case":
      return "case";
    case "script":
      return "script";
    case "policy":
      return "policy";
    case "features":
      return "product";
  }
};

export default function AIBrainSettingsPage() {
  const router = useRouter();
  const knowledge = useKnowledgeItems();
  const policy = useReplyPolicy();
  const actions = useSettingsActions();
  const leadradarSettings = useLeadRadarSettings();
  const leadradarActions = useLeadRadarConfigActions();

  const [product, setProduct] = useState("");
  const [goal, setGoal] = useState("");
  const [strategy, setStrategy] = useState("");
  const [coldFirstTouch, setColdFirstTouch] = useState("");
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);
  const [saved, setSaved] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [createGroup, setCreateGroup] = useState<KnowledgeGroup["id"] | null>(null);
  const advancedRef = useRef<HTMLDetailsElement | null>(null);

  const items = useMemo(() => knowledge.data?.items ?? [], [knowledge.data?.items]);
  const primaryProductItem = useMemo(() => {
    const productItems = items.filter((item) => item.kind === "product");
    return (
      productItems.find((item) => item.title.trim().toLowerCase() === AI_BRAIN_PRODUCT_TITLE.toLowerCase()) ??
      productItems[0] ??
      null
    );
  }, [items]);

  const previewReply = useMemo(() => {
    const cleanGoal = goal.trim() || "следующему шагу";
    const cleanProduct = product.trim() || "вашему продукту";
    const cleanStrategy = strategy.trim() || "уточнять детали и объяснять просто";
    return `Отличный вопрос. ${cleanProduct} может помочь в вашей ситуации.\n\nЧтобы дать точный вариант, задам 1-2 уточняющих вопроса.\n\nПосле этого помогу перейти к ${cleanGoal}. (${cleanStrategy.slice(0, 90)}${cleanStrategy.length > 90 ? "..." : ""})`;
  }, [goal, product, strategy]);

  useEffect(() => {
    setProduct(primaryProductItem?.content ?? "");
  }, [primaryProductItem]);

  useEffect(() => {
    const values = readAiBrainValues(policy.data?.policy);
    setGoal(values.goal);
    setStrategy(values.strategy);
  }, [policy.data?.policy]);

  if (knowledge.isLoading || policy.isLoading || leadradarSettings.isLoading) {
    return <LoadingState label="Загрузка настроек..." />;
  }

  const grouped = KNOWLEDGE_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.match(item, primaryProductItem?.id ?? null))
  }));

  useEffect(() => {
    setColdFirstTouch(leadradarSettings.data?.coldFirstTouchPlaybook ?? "");
  }, [leadradarSettings.data?.coldFirstTouchPlaybook]);

  const handleSaveBrain = async () => {
    setError(null);
    setSaveOk(null);
    try {
      const sourcePolicy = policy.data?.policy;
      const nextToneRules = toneRulesToObject(sourcePolicy?.toneRules);
      nextToneRules[AI_BRAIN_GOAL_KEY] = goal.trim();
      nextToneRules[AI_BRAIN_STRATEGY_KEY] = strategy.trim();

      if (product.trim().length > 0) {
        if (primaryProductItem) {
          await actions.updateKnowledge.mutateAsync({
            id: primaryProductItem.id,
            payload: {
              kind: "product",
              title: primaryProductItem.title || AI_BRAIN_PRODUCT_TITLE,
              content: product.trim(),
              isActive: true
            }
          });
        } else {
          await actions.createKnowledge.mutateAsync({
            kind: "product",
            title: AI_BRAIN_PRODUCT_TITLE,
            content: product.trim(),
            priority: 100,
            isActive: true
          });
        }
      }

      await actions.saveReplyPolicy.mutateAsync({
        ...sourcePolicy,
        toneRules: nextToneRules
      });

      await leadradarActions.updateSettings.mutateAsync({
        coldFirstTouchPlaybook: coldFirstTouch.trim().length ? coldFirstTouch.trim() : null
      });

      setSaveOk("Настройки сохранены.");
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить настройки");
    }
  };

  const handleOpenAdvanced = () => {
    setSaved(false);
    setAdvancedOpen(true);
    setTimeout(() => {
      advancedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  const progress = (currentStep / 4) * 100;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Как ИИ общается с клиентами</h1>
        <p className="text-sm text-muted-foreground">Ответьте на 4 вопроса. Это поможет ИИ вести диалог понятнее и эффективнее.</p>
      </div>

      {saved ? (
        <Card>
          <CardHeader>
            <CardTitle>Готово. ИИ настроен</CardTitle>
            <CardDescription>Основные параметры сохранены. Вы можете сразу перейти к чатам.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button onClick={() => router.push("/chats")}>Перейти к чатам</Button>
            <Button variant="outline" onClick={handleOpenAdvanced}>
              Открыть расширенные настройки
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="space-y-3">
            <div>
              <CardTitle>Пошаговая настройка</CardTitle>
              <CardDescription>Шаг {currentStep} из 4</CardDescription>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {currentStep === 1 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Что вы продаёте?</label>
                <p className="text-xs text-muted-foreground">Коротко опишите продукт, для кого он и какую проблему решает</p>
                <Textarea
                  rows={6}
                  value={product}
                  onChange={(event) => setProduct(event.target.value)}
                  placeholder="Например: мы помогаем онлайн-школам автоматически отвечать на заявки и доводить до оплаты"
                />
              </div>
            ) : null}

            {currentStep === 2 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">К чему вести клиента?</label>
                <Input
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                  placeholder="например: оставить заявку, записаться на звонок"
                />
              </div>
            ) : null}

            {currentStep === 3 ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Как вести диалог?</label>
                  <p className="text-xs text-muted-foreground">
                    Например: не давать цену сразу, задавать уточняющие вопросы, объяснять просто, вести к следующему шагу
                  </p>
                  <Textarea
                    rows={6}
                    value={strategy}
                    onChange={(event) => setStrategy(event.target.value)}
                    placeholder={"- не давать цену сразу\n- задавать уточняющие вопросы\n- объяснять простыми словами\n- вести к следующему шагу"}
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Шаблоны</p>
                  <div className="flex flex-wrap gap-2">
                    {STRATEGY_TEMPLATES.map((template) => (
                      <Button key={template.id} type="button" size="sm" variant="secondary" onClick={() => setStrategy(template.value)}>
                        {template.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <Card className="border-border/60 bg-muted/20">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Пример ответа ИИ</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="whitespace-pre-line text-sm text-muted-foreground">{previewReply}</p>
                  </CardContent>
                </Card>
              </div>
            ) : null}

            {currentStep === 4 ? (
              <div className="space-y-2">
                <label className="text-sm font-medium">Холодное первое сообщение (в личку)</label>
                <p className="text-xs text-muted-foreground">
                  Это используется только для генерации первого сообщения новому контакту. Коротко: что делаем + главный плюс + что важно уточнить.
                </p>
                <Textarea
                  rows={7}
                  value={coldFirstTouch}
                  onChange={(event) => setColdFirstTouch(event.target.value)}
                  placeholder={
                    "Пример:\n- В первом сообщении коротко скажи, чем мы занимаемся (1 фраза) и в чем главный плюс (1 фраза).\n- Затем задай 1 квалифицирующий вопрос: как сейчас решают задачу / откуда приходят клиенты / какой канал важнее (с 2 вариантами ответа).\n- Без предположений про человека и без длинных объяснений.\n"
                  }
                />
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-2">
              {currentStep > 1 ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setCurrentStep((prev) => (prev > 1 ? ((prev - 1) as 1 | 2 | 3 | 4) : prev))}
                >
                  Назад
                </Button>
              ) : null}

              {currentStep < 4 ? (
                <Button type="button" onClick={() => setCurrentStep((prev) => (prev < 4 ? ((prev + 1) as 1 | 2 | 3 | 4) : prev))}>
                  Далее
                </Button>
              ) : (
                <Button
                  onClick={handleSaveBrain}
                  disabled={
                    actions.saveReplyPolicy.isPending ||
                    actions.updateKnowledge.isPending ||
                    actions.createKnowledge.isPending ||
                    leadradarActions.updateSettings.isPending
                  }
                >
                  {actions.saveReplyPolicy.isPending ||
                  actions.updateKnowledge.isPending ||
                  actions.createKnowledge.isPending ||
                  leadradarActions.updateSettings.isPending
                    ? "Сохранение..."
                    : "Сохранить"}
                </Button>
              )}

              {saveOk ? <p className="text-sm text-emerald-600">{saveOk}</p> : null}
              {error ? <p className="text-sm text-destructive">{error}</p> : null}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="pt-6">
          <details
            ref={advancedRef}
            open={advancedOpen}
            onToggle={(event) => setAdvancedOpen((event.currentTarget as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer list-none text-base font-medium">
              <span>Расширенные настройки (необязательно)</span>
            </summary>
            <p className="mt-1 text-sm text-muted-foreground">Эти блоки ИИ использует как дополнительные аргументы в диалоге.</p>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {grouped.map((group) => (
                <Card key={group.id} className="border-border/70">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{group.title}</CardTitle>
                    <CardDescription>{group.hint}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {group.items.length ? (
                      group.items.map((item) => (
                        <div key={item.id} className="rounded-md border border-border/70 p-2">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <div className="truncate text-sm font-medium">{item.title}</div>
                            <Badge variant={item.isActive ? "success" : "warning"}>{item.isActive ? "активно" : "выключено"}</Badge>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                              Изменить
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={async () => {
                                setError(null);
                                try {
                                  await actions.updateKnowledge.mutateAsync({
                                    id: item.id,
                                    payload: { isActive: !item.isActive }
                                  });
                                } catch (toggleError) {
                                  setError(toggleError instanceof Error ? toggleError.message : "Не удалось изменить статус");
                                }
                              }}
                            >
                              {item.isActive ? "Выключить" : "Включить"}
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState title={group.empty} description="Добавьте блок, чтобы ИИ мог использовать его в ответах." />
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setCreateGroup(group.id)}>
                      Добавить {group.title}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      {createGroup ? (
        <Card>
          <CardHeader>
            <CardTitle>Добавить блок знаний</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeItemForm
              initial={{
                id: "new",
                kind: kindByGroup(createGroup),
                title: "",
                content: "",
                isActive: true,
                priority: 50,
                version: 1
              }}
              submitLabel={actions.createKnowledge.isPending ? "Сохранение..." : "Сохранить"}
              disabled={actions.createKnowledge.isPending}
              onCancel={() => setCreateGroup(null)}
              onSubmit={async (payload) => {
                setError(null);
                try {
                  await actions.createKnowledge.mutateAsync(payload);
                  setCreateGroup(null);
                } catch (createError) {
                  setError(createError instanceof Error ? createError.message : "Не удалось создать блок");
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Редактировать блок знаний</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeItemForm
              initial={editing}
              submitLabel={actions.updateKnowledge.isPending ? "Сохранение..." : "Сохранить"}
              disabled={actions.updateKnowledge.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (payload) => {
                setError(null);
                try {
                  await actions.updateKnowledge.mutateAsync({ id: editing.id, payload });
                  setEditing(null);
                } catch (updateError) {
                  setError(updateError instanceof Error ? updateError.message : "Не удалось обновить блок");
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
