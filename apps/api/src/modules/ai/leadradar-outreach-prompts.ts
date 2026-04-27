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

  return lines.length ? lines.join("\n") : "вЂ”";
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
    : "вЂ”";

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
    `"${leadMessage || "вЂ”"}"`,
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
    "- Use 'buyer_direct' when lead is directly looking for an исполнителя/решение.",
    "- Use 'business_owner_with_problem' when lead describes a business pain (no leads, manual work, no site, etc.).",
    "- Use 'unclear' if you can't tell.",
    "- If the lead message is empty/very short/only a link OR you have no real info about the person: DO NOT guess their niche or activity.",
    "  In that case set:",
    '  - detectedRole = "вЂ”"',
    '  - detectedActivity = "вЂ”"',
    '  - detectedNeedOrPain = "вЂ”"',
    '  - confidence = "low"',
    "  - contactReason: neutral, depends on sourceType (DM vs chat) without claiming you saw anything",
    "  - relevantOfferAngle: 1 short generic value angle based on AI Brain (no hardcoded product names)",
    "  - bestQuestion: 1 qualifying question about their current process/status quo (two options if possible).",
    "- relevantOfferAngle must be grounded in AI Brain context (what we can realistically offer).",
    "- keyTopic: extract ONE primary obvious topic from the lead message (1-2 words max).",
    "- If no clear topic, set keyTopic to null.",
    "- Do NOT extract multiple topics. Do NOT overthink.",
    "- detectedActivity: what they do, 2-5 words max.",
    "- productFit: true if our product (from AI Brain context) is plausibly relevant to their workflow right now; otherwise false.",
    "- productFitReason: short (max ~8 words), no marketing.",
    "- contactReason: short (3-8 words), natural reason for writing based on the SOURCE TYPE.",
    "- bestQuestion: ONE short qualifying question that helps start a dialogue and moves towards a sale later.",
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
  relatedPostId?: string | null | undefined;
  contextPreview?: string | null | undefined;
  coldFirstTouchPlaybook?: string | null | undefined;
  analysis: OutreachLeadAnalysis;
  knowledgeItems: Array<Pick<KnowledgeItem, "kind" | "title" | "content">>;
  replyPolicy: Pick<ReplyPolicy, "toneRules" | "pricingRules" | "forbiddenPromises" | "forbiddenTopics"> | null;
}) => {
  const leadMessage = clip(params.leadMessage ?? "", 1400);
  const leadName = (params.leadName ?? "").trim();
  const sourceType = (params.sourceType ?? "").trim();
  const chatTitle = (params.chatTitle ?? "").trim();
  const relatedPostId = (params.relatedPostId ?? "").trim();
  const contextPreview = clip(params.contextPreview ?? "", 320);
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
    : "вЂ”";

  const coldFirstTouchBlock = params.coldFirstTouchPlaybook?.trim()
    ? clip(params.coldFirstTouchPlaybook.trim(), 1200)
    : "вЂ”";

const strictFirstMessageRules = `FIRST MESSAGE GOAL (STRICT):
- Do NOT sell anything in the first message.
- Do NOT offer audit, services, consultation, implementation, product, bot, CRM, website, automation, or help.
- Do NOT write: "могу помочь", "могу разобрать", "можем сделать", "предлагаю", "оставьте заявку", "давайте созвонимся".
- Your only goal is to start a natural conversation and ask one simple relevant qualifying question.
- The message must feel like a normal Telegram chat message, not outreach or advertising.

CONTEXT USAGE (STRICT):
- Use the lead context to make the question specific, but do not explicitly say that you saw, found, noticed, or analyzed anything.
- Prefer context-specific questions over generic business questions.
- Use context only to choose the topic of the question, not to reveal the source of the context.

FORBIDDEN PHRASES (STRICT):
- "увидел", "заметил", "смотрел", "нашёл", "наткнулся", "попался"
- "пишу, потому что", "вижу, что", "судя по"
- "ты занимаешься...", "вы занимаетесь...", "у вас есть проблема..."
- "где теряются клиенты", "теряете клиентов"
- "разобрать проект", "AI-аудит", "ИИ-аудит", "аудит сайта", "бесплатно разобрать"

QUESTION OVER CLAIM:
- Do NOT confidently state what the person does unless it is explicitly stated by the lead.
- Turn context into a question.
- Prefer questions over claims.

GENERIC QUESTION BAN WHEN CONTEXT EXISTS:
- If lead context contains a clear niche, role, service, product, pain, or topic, avoid generic questions like:
  "Как вы привлекаете клиентов?",
  "У вас есть сайт?",
  "Чем вы занимаетесь?",
  "Как сейчас идут заявки?"
- Instead, ask one question tied to that niche/service/topic.`;

  const systemPrompt = `You are writing a first cold outreach message in Telegram.

First-touch objective:
- Start a natural dialogue.
- Ask exactly ONE simple relevant qualifying question.
- Do NOT sell or pitch in the first message.

Source context:
- If sourceType indicates DM/private/direct/manual OR chatTitle contains "Личка": do NOT mention chats/groups/channels.
- If sourceType indicates group/channel/comments: you may use neutral context, but never detective wording.

Low-context behavior:
- If leadMessage is empty/"вЂ”" OR analysis.confidence is "low", do NOT guess who the person is or what they do.
- Prefer a neutral opener and one qualifying question with 2 simple options when possible.

${strictFirstMessageRules}

Format:
- 1-2 short sentences.
- Exactly one question.
- No markdown, no lists, no multiple options blocks.
- Output ONLY the message text.`;

  const userPrompt = [
    "Lead context:",
    `Message: "${leadMessage || "вЂ”"}"`,
    leadName ? `Lead name: "${clip(leadName, 80)}"` : "Lead name: (unknown)",
    sourceType ? `sourceType: "${clip(sourceType, 60)}"` : "sourceType: (unknown)",
    chatTitle ? `chatTitle: "${clip(chatTitle, 80)}"` : "chatTitle: (unknown)",
    relatedPostId ? `relatedPostId: "${clip(relatedPostId, 120)}"` : "relatedPostId: (none)",
    contextPreview.trim().length ? `contextPreview: "${contextPreview}"` : "contextPreview: (none)",
    "",
    "AI Brain / product context (knowledge base):",
    brain,
    "",
    "Playbook: cold first touch (outreach only, may be empty):",
    coldFirstTouchBlock,
    "",
    "Reply policy (may be empty):",
    policyBlock,
    "",
    "Analysis result (use as context, do not output JSON):",
    JSON.stringify(params.analysis),
    "",
    strictFirstMessageRules,
    "",
    "Pattern for this first message:",
    "- greeting",
    "- optional very short neutral bridge, only if natural",
    "- exactly one simple question about current situation",
    "",
    "Bad examples (forbidden direction):",
    '- "Увидел сообщение в чате..."',
    '- "Могу бесплатно разобрать..."',
    '- "Покажу, где теряются клиенты..."',
    '- "Мы делаем сайты, боты и CRM..."',
    '- "Давайте созвонимся..."',
    "",
    "Good direction examples:",
    '- "Привет! Подскажи, ты сейчас больше делаешь инфографику под карточки товаров или ещё ведёшь упаковку/продвижение магазинов?"',
    '- "Привет! У тебя сейчас клиенты больше приходят из Telegram или с рекомендаций?"',
    "",
    "Generic vs context-specific examples (when context exists):",
    '- Bad: "Привет! Как ты сейчас привлекаешь клиентов — больше через сайт или рекомендации?"',
    '- Good: "Привет! Подскажи, клиенты на инфографику сейчас больше приходят с рекомендаций или из Telegram/чатов?"',
    '- Bad: "Привет! У вас сейчас заявки больше с сайта или из Telegram?"',
    '- Good: "Привет! Подскажи, заявки на ремонт сейчас чаще приходят с Авито, рекомендаций или из Telegram?"',
    "",
    "Final constraints:",
    "- Do NOT add value proposition in the first message.",
    "- Keep only a natural opener + one question.",
    "- Output ONLY the message text."
  ].join("\n");

  return { systemPrompt, userPrompt };
};
