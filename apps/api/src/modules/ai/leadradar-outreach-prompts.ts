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
  keyTopic: string | null;
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
    `  "keyTopic": string | null,`,
    `  "confidence": "low" | "medium" | "high"`,
    `}`,
    "",
    "Rules:",
    "- Use 'service_provider' when lead is offering services / looking for clients / advertising themselves.",
    "- Use 'buyer_direct' when lead is directly looking for an исполнителя/решение (\"кто сделает...\", \"нужен специалист\").",
    "- Use 'business_owner_with_problem' when lead describes a business pain (no leads, manual work, no site, etc.).",
    "- Use 'unclear' if you can't tell.",
    "- relevantOfferAngle must be grounded in AI Brain context (what we can realistically offer).",
    "- keyTopic: extract ONE primary obvious topic from the lead message (1-2 words max). Examples: \"таргет\", \"воронки\", \"сайт\", \"дизайн\", \"клиенты\".",
    "- If no clear topic, set keyTopic to null.",
    "- Do NOT extract multiple topics. Do NOT overthink.",
    "- IMPORTANT: first touch message should NOT pitch the product. Prefer a natural conversation opener + one simple question.",
    "- relevantOfferAngle is for internal strategy; do not assume it must be mentioned explicitly in the first message."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

export const buildLeadRadarOutreachMessagePrompt = (params: {
  leadMessage: string | null | undefined;
  leadName?: string | null | undefined;
  analysis: OutreachLeadAnalysis;
  knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>;
  replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
  styleFamilyHint?: "A" | "B" | "C" | "D";
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

Цель первого сообщения: получить ответ и начать диалог, а не продавать.

Стиль:
- 1–2 коротких предложения (3 только если без воды)
- живо и естественно, без канцелярита
- без "Здравствуйте/Добрый день/Уважаемый"
- без "Я эксперт", "Предлагаю услуги", "Готов помочь вам"
- без агрессивной продажи
- максимум 1 простой вопрос в конце

Опциональный контекстный заход (если звучит естественно):
- Можно начать с короткой причины написать (3–6 слов), а потом сразу вопрос.
- Лучше опираться на analysis.keyTopic (если есть) или общий смысл сообщения, но НЕ пересказывать текст лида.
- Не делай это каждый раз: иногда начинай сразу с вопроса.
- Не используй роботские формулировки: "я заметил, что ты...", "я увидел, что ты...", "ты написал, что...".

Строго запрещено в первом сообщении:
- пустые комплименты ("Здорово, что ты...", "Классно, что ты...", "Вижу, что ты...")
- упоминать продукт/инструмент/решение без сильной необходимости
- фразы: "у меня есть инструмент", "у меня есть решение", "я могу предложить", "ты пробовал AI", "могу помочь",
  "оптимизировать процессы", "увеличить конверсию"
- длинные вступления, формальный питч, очевидный sales tone

Важно:
- Сообщение должно зависеть от leadType.
- Ты используешь AI Brain контекст, чтобы понять контекст продукта, но в первом сообщении НЕ продаёшь.
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
    "Вариативность структуры (выбери одну семью и придерживайся её):",
    `styleFamilyHint: ${params.styleFamilyHint ?? "none"}`,
    "- A: прямой вопрос по контексту (коротко, сразу к делу).",
    "- B: вопрос про процесс/узкое место (где больше всего времени/сложности).",
    "- C: вопрос про канал/источник (откуда сейчас приходят клиенты/заказы/обращения).",
    "- D: ситуационный заход (руками vs уже есть какой-то процесс), без слова \"автоматизировал\" если звучит неестественно.",
    "ВАЖНО: не используй одну и ту же форму каждый раз; меняй структуру между A/B/C/D, но не удлиняй сообщение.",
    "",
    "Инструкция по leadType (пиши максимально естественно, без продажи):",
    "- buyer_direct: уточни 1 деталь по задаче (срок/объём/формат), без самопрезентации.",
    "- service_provider: зацепись за контекст и задай простой вопрос про текущий поток клиентов/как они сейчас это делают.",
    "- business_owner_with_problem: отзеркаль боль коротко и спроси, где сейчас самое узкое место/что пробовали.",
    "- unclear: нейтральный короткий заход + 1 вопрос, чтобы понять, что именно нужно/актуально.",
    "",
    "Требования к выходу:",
    "- 1–2 коротких предложения",
    "- 0–1 вопрос (лучше 1)",
    "- без комплиментов и без упоминания продукта/инструмента",
    "",
    "Лёгкая персонализация по теме:",
    "- Если analysis.keyTopic НЕ null — аккуратно упомяни эту тему в тексте или вопросе (1 раз).",
    "- Не пиши \"вижу, что ты...\" и не пересказывай сообщение лида.",
    "- Не цитируй lead message verbatim — только мягкая отсылка к теме.",
    "- Если keyTopic нет — пиши нейтрально, как раньше."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

