import type { KnowledgeItem, ReplyPolicy } from "@prisma/client";

const clip = (value: string, max: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
};

const pickBrainContext = (items: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>) => {
  const product = items.filter((i) => i.kind === "PRODUCT").slice(0, 4);
  const scripts = items.filter((i) => i.kind === "SCRIPT").slice(0, 3);
  const faq = items.filter((i) => i.kind === "FAQ").slice(0, 2);
  const other = items.filter((i) => i.kind === "OTHER").slice(0, 2);

  const lines = [
    ...product.map((i) => `- [product] ${i.title}: ${clip(i.content, 260)}`),
    ...scripts.map((i) => `- [script] ${i.title}: ${clip(i.content, 220)}`),
    ...faq.map((i) => `- [faq] ${i.title}: ${clip(i.content, 220)}`),
    ...other.map((i) => `- [other] ${i.title}: ${clip(i.content, 220)}`)
  ];

  return lines.length ? lines.join("\n") : "—";
};

export const LEADRADAR_OUTREACH_ANALYSIS_PROMPT_KEY = "leadradar_outreach_analysis_v1" as const;
export const LEADRADAR_OUTREACH_MESSAGE_PROMPT_KEY = "leadradar_outreach_message_v1" as const;

export type OutreachLeadType = "buyer_direct" | "service_provider" | "business_owner_with_problem" | "unclear";
export type OutreachConfidence = "low" | "medium" | "high";

export type OutreachLeadAnalysis = {
  leadType: OutreachLeadType;
  detectedRole: string;
  detectedNeedOrPain: string;
  relevantOfferAngle: string;
  confidence: OutreachConfidence;
};

export const buildLeadRadarOutreachAnalysisPrompt = (params: {
  leadMessage: string | null | undefined;
  leadName?: string | null | undefined;
  knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>;
  replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
}) => {
  const leadMessage = clip(params.leadMessage ?? "", 1400);
  const leadName = (params.leadName ?? "").trim();
  const brain = pickBrainContext(params.knowledgeItems);

  const policyBlock = params.replyPolicy
    ? clip(
        JSON.stringify(
          {
            toneRules: params.replyPolicy.toneRules ?? null,
            pricingRules: params.replyPolicy.pricingRules ?? null,
            forbiddenPromises: params.replyPolicy.forbiddenPromises ?? null,
            forbiddenTopics: params.replyPolicy.forbiddenTopics ?? null
          },
          null,
          0
        ),
        900
      )
    : "—";

  const systemPrompt = `You are an analyst for CRM outreach in Telegram.

Goal: classify the lead and pick the most relevant offer angle based on:
- lead message
- product / AI Brain context (what the user sells and how it helps)

Return ONLY valid JSON.
No markdown. No explanations.`;

  const userPrompt = [
    "You will analyze a lead for the first outreach in Telegram.",
    "",
    "Lead message:",
    `"${leadMessage || "—"}"`,
    leadName ? `Lead name: "${clip(leadName, 80)}"` : "Lead name: (unknown)",
    "",
    "AI Brain / product context (knowledge base):",
    brain,
    "",
    "Reply policy (may be empty):",
    policyBlock,
    "",
    "Return JSON with EXACT keys:",
    `{`,
    `  "leadType": "buyer_direct" | "service_provider" | "business_owner_with_problem" | "unclear",`,
    `  "detectedRole": string,`,
    `  "detectedNeedOrPain": string,`,
    `  "relevantOfferAngle": string,`,
    `  "confidence": "low" | "medium" | "high"`,
    `}`,
    "",
    "Rules:",
    "- Use 'service_provider' when lead is offering services / looking for clients / advertising themselves.",
    "- Use 'buyer_direct' when lead is directly looking for an исполнителя/решение (\"кто сделает...\", \"нужен специалист\").",
    "- Use 'business_owner_with_problem' when lead describes a business pain (no leads, manual work, no site, etc.).",
    "- Use 'unclear' if you can't tell.",
    "- relevantOfferAngle must be grounded in AI Brain context (what we can realistically offer)."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

export const buildLeadRadarOutreachMessagePrompt = (params: {
  leadMessage: string | null | undefined;
  leadName?: string | null | undefined;
  analysis: OutreachLeadAnalysis;
  knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>;
  replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
}) => {
  const leadMessage = clip(params.leadMessage ?? "", 1400);
  const leadName = (params.leadName ?? "").trim();
  const brain = pickBrainContext(params.knowledgeItems);
  const policyBlock = params.replyPolicy
    ? clip(
        JSON.stringify(
          {
            toneRules: params.replyPolicy.toneRules ?? null,
            pricingRules: params.replyPolicy.pricingRules ?? null,
            forbiddenPromises: params.replyPolicy.forbiddenPromises ?? null,
            forbiddenTopics: params.replyPolicy.forbiddenTopics ?? null
          },
          null,
          0
        ),
        900
      )
    : "—";

  const systemPrompt = `Ты пишешь первое сообщение человеку в Telegram.

Стиль:
- 1–3 предложения максимум
- живо и естественно, без канцелярита
- без "Здравствуйте/Добрый день/Уважаемый"
- без "Я эксперт", "Предлагаю услуги", "Готов помочь вам"
- без агрессивной продажи
- максимум 1 простой вопрос в конце

Важно:
- Сообщение должно зависеть от leadType.
- Ты используешь AI Brain контекст, чтобы выбрать релевантный угол оффера.
- Не выдумывай детали — только по контексту.

Выведи только текст сообщения. Без пояснений.`;

  const userPrompt = [
    "Контекст лида:",
    `Сообщение: "${leadMessage || "—"}"`,
    leadName ? `Имя: "${clip(leadName, 80)}"` : "Имя: (неизвестно)",
    "",
    "AI Brain / product context (knowledge base):",
    brain,
    "",
    "Reply policy (may be empty):",
    policyBlock,
    "",
    "Результат анализа (используй это, чтобы выбрать правильный оффер/угол):",
    JSON.stringify(params.analysis),
    "",
    "Инструкция по leadType:",
    "- buyer_direct: человек ищет исполнителя/решение → мягко показать, что можем помочь с задачей, уточнить деталь.",
    "- service_provider: человек сам продаёт услуги → показать, что наш продукт может помочь находить/обрабатывать клиентов в Telegram (без кринжа).",
    "- business_owner_with_problem: показать, что поняли боль, предложить релевантный подход/решение через продукт.",
    "- unclear: нейтрально и коротко, 1 вопрос чтобы прояснить."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

