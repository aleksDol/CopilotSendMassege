"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import type { ReplyPolicy } from "@/lib/api/types";

const stringify = (value: unknown) => (value == null ? "" : typeof value === "string" ? value : JSON.stringify(value, null, 2));
const parse = (value: string) => {
  if (!value.trim()) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

export function ReplyPolicyForm({
  initial,
  onSubmit,
  disabled
}: {
  initial?: ReplyPolicy;
  onSubmit: (payload: ReplyPolicy) => Promise<void>;
  disabled?: boolean;
}) {
  const [toneRules, setToneRules] = useState("");
  const [pricingRules, setPricingRules] = useState("");
  const [discountRules, setDiscountRules] = useState("");
  const [forbiddenPromises, setForbiddenPromises] = useState("");
  const [forbiddenTopics, setForbiddenTopics] = useState("");
  const [humanHandoffRules, setHumanHandoffRules] = useState("");

  useEffect(() => {
    setToneRules(stringify(initial?.toneRules));
    setPricingRules(stringify(initial?.pricingRules));
    setDiscountRules(stringify(initial?.discountRules));
    setForbiddenPromises(stringify(initial?.forbiddenPromises));
    setForbiddenTopics(stringify(initial?.forbiddenTopics));
    setHumanHandoffRules(stringify(initial?.humanHandoffRules));
  }, [initial]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Политика ответов</CardTitle>
        <CardDescription>Ограничения для подсказок ИИ.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            await onSubmit({
              toneRules: parse(toneRules),
              pricingRules: parse(pricingRules),
              discountRules: parse(discountRules),
              forbiddenPromises: parse(forbiddenPromises),
              forbiddenTopics: parse(forbiddenTopics),
              humanHandoffRules: parse(humanHandoffRules)
            });
          }}
        >
          <Field label="Правила тона" value={toneRules} onChange={setToneRules} />
          <Field label="Правила цен" value={pricingRules} onChange={setPricingRules} />
          <Field label="Правила скидок" value={discountRules} onChange={setDiscountRules} />
          <Field label="Запрещённые обещания" value={forbiddenPromises} onChange={setForbiddenPromises} />
          <Field label="Запрещённые темы" value={forbiddenTopics} onChange={setForbiddenTopics} />
          <Field label="Передача человеку" value={humanHandoffRules} onChange={setHumanHandoffRules} />

          <Button type="submit" disabled={disabled}>
            Сохранить политику
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (next: string) => void }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Textarea rows={4} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
