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
  detectedActivity: string;
  productFit: boolean;
  productFitReason: string;
  contactReason: string;
  bestQuestion: string;
  confidence: OutreachConfidence;
};

export const buildLeadRadarOutreachAnalysisPrompt = (params: {
  leadMessage: string | null | undefined;
  leadName?: string | null | undefined;
  sourceType?: string | null | undefined;
  chatTitle?: string | null | undefined;
  knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>;
  replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
}) => {
  const leadMessage = clip(params.leadMessage ?? "", 1400);
  const leadName = (params.leadName ?? "").trim();
  const sourceType = (params.sourceType ?? "").trim();
  const chatTitle = (params.chatTitle ?? "").trim();
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

Goal:
- understand who the lead is and what they do (based on their message)
- decide if our product is relevant (productFit)
- draft short internal "reason for writing" and "best question" to start a dialogue

IMPORTANT:
- Keep everything SHORT and non-marketing.
- Do NOT mention AI.
- The result is internal analysis (not user-facing copy), but keep it natural.

Return ONLY valid JSON.
No markdown. No explanations.`;

  const userPrompt = [
    "You will analyze a lead for the first outreach in Telegram.",
    "",
    "Lead message:",
    `"${leadMessage || "—"}"`,
    leadName ? `Lead name: "${clip(leadName, 80)}"` : "Lead name: (unknown)",
    sourceType ? `Lead sourceType: "${clip(sourceType, 60)}"` : "Lead sourceType: (unknown)",
    chatTitle ? `Lead chatTitle: "${clip(chatTitle, 80)}"` : "Lead chatTitle: (unknown)",
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
    `  "detectedActivity": string,`,
    `  "detectedNeedOrPain": string,`,
    `  "relevantOfferAngle": string,`,
    `  "productFit": boolean,`,
    `  "productFitReason": string,`,
    `  "contactReason": string,`,
    `  "bestQuestion": string,`,
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
    "- detectedActivity: what they do, 2-5 words max (e.g. \"занимается таргетом\", \"делает сайты\", \"ищет исполнителя\").",
    "- productFit: true if our product (from AI Brain context) is plausibly relevant to their workflow right now; otherwise false.",
    "- productFitReason: short (max ~8 words), no marketing.",
    "- contactReason: short (3-8 words), natural reason for writing based on the SOURCE TYPE:",
    "  - if sourceType indicates DM/private (direct/private/dm/\"личка\") OR sourceType=\"manual\" OR chatTitle contains \"Личка\": NEVER claim you saw a message in a chat. Use a neutral reason like \"пишу в личку по теме\" / \"по вашему вопросу\".",
    "  - if sourceType indicates group/chat/channel_comments: you may say \"увидел сообщение в чате\" / \"увидел комментарий\" (keep it short).",
    "- bestQuestion: ONE short qualifying question that helps start a dialogue and moves towards a sale later, grounded in relevantOfferAngle and detectedNeedOrPain.",
    "- IMPORTANT: first touch message should NOT pitch the product. Prefer a natural opener + one qualifying question.",
    "- relevantOfferAngle is for internal strategy; do not assume it must be mentioned explicitly in the first message."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

export const buildLeadRadarOutreachMessagePrompt = (params: {
  leadMessage: string | null | undefined;
  leadName?: string | null | undefined;
  sourceType?: string | null | undefined;
  chatTitle?: string | null | undefined;
  analysis: OutreachLeadAnalysis;
  knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>;
  replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
}) => {
  const leadMessage = clip(params.leadMessage ?? "", 1400);
  const leadName = (params.leadName ?? "").trim();
  const sourceType = (params.sourceType ?? "").trim();
  const chatTitle = (params.chatTitle ?? "").trim();
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

Цель: быстро заинтересовать и начать диалог (первый контакт), чтобы получить ответ и перейти к дальнейшему сотрудничеству.

Можно (и часто нужно) коротко обозначить, что именно мы предлагаем — но:
- без цен/условий/скидок
- без давления и “впаривания”
- 1 короткая ценность/выгода, основанная на AI Brain и analysis.relevantOfferAngle

Контекст источника:
- Если sourceType означает ЛИЧКУ (direct/private/dm/личка) ИЛИ sourceType="manual" ИЛИ chatTitle содержит "Личка": запрещено писать "видел(а) ваше сообщение в чате/группе/канале" и любые отсылки к чату.
- Если sourceType означает ЧАТ/ГРУППУ/КОММЕНТАРИИ: можно коротко сослаться на сообщение/комментарий.

Если analysis.productFit = true, сообщение ДОЛЖНО следовать структуре:
1) короткое приветствие: "Привет."
2) причина написать: используй analysis.contactReason (коротко, естественно)
3) понимание, чем человек занимается: используй analysis.detectedActivity (вставь буквально, без пересказа сообщения)
4) короткий релевантный “угол” (1 фраза): используй analysis.relevantOfferAngle (и/или 1 мысль из AI Brain) без хардкора под конкретный продукт
5) один вопрос: используй analysis.bestQuestion (или близко к нему)

Если analysis.productFit = false:
- коротко и нейтрально, 1 вопрос по теме, без попытки натянуть product-fit.

Ограничения:
- максимум 2 предложения (3 только если очень коротко)
- ровно ОДИН вопрос
- Telegram-стиль, без формальностей

Запрещено:
- пустые комплименты
- "могу помочь", "увеличить конверсию", "оптимизировать процессы"
- агрессивные обещания результата
- роботские фразы: "я заметил что ты...", "я увидел что ты...", "ты написал что..."
- длинные объяснения

Выведи только текст сообщения. Без пояснений.`;

  const userPrompt = [
    "Контекст лида:",
    `Сообщение: "${leadMessage || "—"}"`,
    leadName ? `Имя: "${clip(leadName, 80)}"` : "Имя: (неизвестно)",
    sourceType ? `sourceType: "${clip(sourceType, 60)}"` : "sourceType: (неизвестно)",
    chatTitle ? `chatTitle: "${clip(chatTitle, 80)}"` : "chatTitle: (неизвестно)",
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
    "Правила сборки сообщения:",
    "- Если analysis.productFit=true: используй analysis.contactReason + analysis.detectedActivity + analysis.relevantOfferAngle + analysis.bestQuestion.",
    "- detectedActivity вставляй коротко и буквально (чтобы было понятно, что это не шаблон).",
    "- Если analysis.keyTopic НЕ null — можно мягко упомянуть тему 1 раз, но не обязательно.",
    "- Не пересказывай lead message и не цитируй его.",
    "- Должен быть ровно один вопрос.",
    "- Вопрос должен быть квалифицирующим (чтобы понять потребность/ситуацию и потом предложить релевантный оффер), но без продажи в лоб.",
    "- Можно обозначить 1 ценность из AI Brain коротко (без цен и обещаний), но не превращай это в “презентацию продукта”.",
    "- Не делай маркетинговых формулировок."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

