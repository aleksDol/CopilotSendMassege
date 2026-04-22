"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { LoadingState } from "@/components/common/loading-state";
import { KnowledgeItemForm } from "@/components/settings/knowledge-item-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useKnowledgeItems, useReplyPolicy, useSettingsActions } from "@/lib/hooks/use-app-data";
import type { KnowledgeItem, ReplyPolicy } from "@/lib/api/types";

const AI_BRAIN_PRODUCT_TITLE = "AI Brain Product";
const AI_BRAIN_GOAL_KEY = "aiBrainGoal";
const AI_BRAIN_STRATEGY_KEY = "aiBrainStrategy";

const STRATEGY_TEMPLATES = [
  {
    id: "seller",
    label: "Seller",
    value:
      "Lead the client from interest to action. Clarify goals, show value in simple words, handle objections calmly, and move toward the next step."
  },
  {
    id: "consultant",
    label: "Consultant",
    value:
      "Act like a trusted consultant. Ask clarifying questions first, diagnose the situation, then recommend the most suitable option and next action."
  },
  {
    id: "soft",
    label: "Soft",
    value:
      "Keep the tone warm and low-pressure. Explain clearly, avoid aggressive selling, gently guide the client toward a useful next step."
  },
  {
    id: "direct",
    label: "Direct",
    value:
      "Be concise and action-oriented. Get to the main point quickly, ask only key questions, and lead the client to a concrete next step."
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
    hint: "Common client questions",
    empty: "No FAQ blocks yet",
    match: (item) => item.kind === "faq"
  },
  {
    id: "case",
    title: "Cases",
    hint: "Examples and outcomes",
    empty: "No case blocks yet",
    match: (item) => item.kind === "case"
  },
  {
    id: "script",
    title: "Objections",
    hint: "How to handle concerns",
    empty: "No objection blocks yet",
    match: (item) => item.kind === "script"
  },
  {
    id: "policy",
    title: "Pricing",
    hint: "Rates and conditions",
    empty: "No pricing blocks yet",
    match: (item) => item.kind === "policy"
  },
  {
    id: "features",
    title: "Features",
    hint: "Capabilities and details",
    empty: "No feature blocks yet",
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
  const knowledge = useKnowledgeItems();
  const policy = useReplyPolicy();
  const actions = useSettingsActions();

  const [product, setProduct] = useState("");
  const [goal, setGoal] = useState("");
  const [strategy, setStrategy] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);
  const [editing, setEditing] = useState<KnowledgeItem | null>(null);
  const [createGroup, setCreateGroup] = useState<KnowledgeGroup["id"] | null>(null);

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
    const cleanGoal = goal.trim() || "the next agreed step";
    const cleanProduct = product.trim() || "your offer";
    const cleanStrategy = strategy.trim() || "ask clarifying questions and explain simply";
    return `Great question. ${cleanProduct} can help here.\n\nTo suggest the best option, may I ask 1-2 details about your case?\n\nThen I will guide you to ${cleanGoal}. (${cleanStrategy.slice(0, 90)}${cleanStrategy.length > 90 ? "..." : ""})`;
  }, [goal, product, strategy]);

  useEffect(() => {
    setProduct(primaryProductItem?.content ?? "");
  }, [primaryProductItem]);

  useEffect(() => {
    const values = readAiBrainValues(policy.data?.policy);
    setGoal(values.goal);
    setStrategy(values.strategy);
  }, [policy.data?.policy]);

  if (knowledge.isLoading || policy.isLoading) {
    return <LoadingState label="Loading settings..." />;
  }

  const grouped = KNOWLEDGE_GROUPS.map((group) => ({
    ...group,
    items: items.filter((item) => group.match(item, primaryProductItem?.id ?? null))
  }));

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

      setSaveOk("Settings saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save settings");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">How AI talks to clients</h1>
        <p className="text-sm text-muted-foreground">Answer a few simple questions and save.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>What do you sell?</CardTitle>
          <CardDescription>Briefly describe your product, who it is for, and what problem it solves</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            rows={5}
            value={product}
            onChange={(event) => setProduct(event.target.value)}
            placeholder="Describe what you sell and who it helps"
          />

          <div className="space-y-2">
            <label className="text-sm font-medium">What should AI lead the client to?</label>
            <p className="text-xs text-muted-foreground">Examples: leave a request, book a call, send project details</p>
            <Input
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              placeholder="leave a request / book a call / send project details"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">How should AI lead the conversation?</label>
            <p className="text-xs text-muted-foreground">
              For example: do not give price immediately, ask clarifying questions, explain simply, move toward the next
              step
            </p>
            <Textarea
              rows={5}
              value={strategy}
              onChange={(event) => setStrategy(event.target.value)}
              placeholder={"- do not give price immediately\n- ask clarifying questions\n- explain simply\n- move toward the next step"}
            />
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium">Templates</p>
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
              <CardTitle className="text-base">Example AI reply</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm text-muted-foreground">{previewReply}</p>
            </CardContent>
          </Card>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          onClick={handleSaveBrain}
          disabled={actions.saveReplyPolicy.isPending || actions.updateKnowledge.isPending || actions.createKnowledge.isPending}
        >
          {actions.saveReplyPolicy.isPending || actions.updateKnowledge.isPending || actions.createKnowledge.isPending
            ? "Saving..."
            : "Save settings"}
        </Button>
        {saveOk ? <p className="text-sm text-emerald-600">{saveOk}</p> : null}
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
      </div>

      <Card>
        <CardContent className="pt-6">
          <details>
            <summary className="cursor-pointer list-none text-base font-medium">
              <span>Advanced knowledge for AI</span>
            </summary>
            <p className="mt-1 text-sm text-muted-foreground">Used by AI as supporting arguments in conversations</p>

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
                            <Badge variant={item.isActive ? "success" : "warning"}>{item.isActive ? "active" : "inactive"}</Badge>
                          </div>
                          <p className="line-clamp-2 text-xs text-muted-foreground">{item.content}</p>
                          <div className="mt-2 flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditing(item)}>
                              Edit
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
                                  setError(toggleError instanceof Error ? toggleError.message : "Failed to update status");
                                }
                              }}
                            >
                              {item.isActive ? "Disable" : "Enable"}
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <EmptyState title={group.empty} description="Add a block and use it in AI Brain." />
                    )}
                    <Button size="sm" variant="secondary" onClick={() => setCreateGroup(group.id)}>
                      Add {group.title}
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
            <CardTitle>Add knowledge block</CardTitle>
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
              submitLabel={actions.createKnowledge.isPending ? "Saving..." : "Save"}
              disabled={actions.createKnowledge.isPending}
              onCancel={() => setCreateGroup(null)}
              onSubmit={async (payload) => {
                setError(null);
                try {
                  await actions.createKnowledge.mutateAsync(payload);
                  setCreateGroup(null);
                } catch (createError) {
                  setError(createError instanceof Error ? createError.message : "Failed to create");
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}

      {editing ? (
        <Card>
          <CardHeader>
            <CardTitle>Edit knowledge block</CardTitle>
          </CardHeader>
          <CardContent>
            <KnowledgeItemForm
              initial={editing}
              submitLabel={actions.updateKnowledge.isPending ? "Saving..." : "Save"}
              disabled={actions.updateKnowledge.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={async (payload) => {
                setError(null);
                try {
                  await actions.updateKnowledge.mutateAsync({ id: editing.id, payload });
                  setEditing(null);
                } catch (updateError) {
                  setError(updateError instanceof Error ? updateError.message : "Failed to update");
                }
              }}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
