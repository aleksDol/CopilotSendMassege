const clip = (value: string, max: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
};

export const LEADRADAR_AI_SETUP_PROMPT_KEY = "leadradar_ai_setup_v3" as const;

/** Canonical order for keywordGroups in API responses. */
export const LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES = [
  "Поиск исполнителя",
  "Описание проблемы",
  "Поиск рекомендаций",
  "Покупательское намерение",
  "Прямые запросы"
] as const;

export type LeadRadarAiSetupKeywordGroupTitle = (typeof LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES)[number];

export const buildLeadRadarAiSetupPrompt = (params: { description: string }) => {
  const description = clip(params.description, 2000);

  const systemPrompt = `You are a B2B marketer configuring LeadRadar — a tool that finds potential clients in Telegram chats by matching buyer-intent phrases.

Your job is NOT to list related vocabulary. Your job is to predict what real people write in Telegram when they are looking to BUY or hire — before they choose a vendor.

Before producing JSON, think internally (do not output this analysis):
1) What does the company sell or do?
2) Who is the ideal client (role, business type, situation)?
3) What pain points / jobs-to-be-done does the company solve?
4) What questions do potential clients ask in Telegram chats?
5) What messages do people write shortly before they buy or hire someone like this?

Then produce the JSON output below.

SUMMARY:
- 1–2 short sentences in plain language (same language as the business description).
- Explain what you found: who the clients are and what buyer phrases you looked for.

KEYWORD GROUPS — return exactly 5 groups in this EXACT order with these EXACT titles:
${LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.map((title, i) => `${i + 1}. "${title}"`).join("\n")}

Each group object must have:
- title: exact title from the list above
- description: one short sentence explaining what phrases belong in this group for this niche
- keywords: array of phrases ONLY for this group (2–7 words each, natural Telegram chat language)

Group keyword rules:
- Focus on BUYER intent: hiring, looking for a vendor, describing a problem, asking for advice, ready to buy.
- Good examples: "посоветуйте разработчика", "сайт не приносит заявки", "кто может сделать", "ищу подрядчика", "нужен лендинг", "есть хороший специалист?"
- Do NOT output single generic words alone: "сайт", "бот", "реклама", "маркетинг" — unless part of a clear purchase-intent phrase.
- Do NOT output seller/ad phrases ("делаю сайты", "предлагаю услуги").
- Do NOT duplicate the same phrase across groups — each phrase in exactly one group.
- If no good phrases for a group, use an empty keywords array [] — do NOT move phrases from other groups.
- Aim for 2–5 keywords per non-empty group; 8–18 keywords total across all groups.

NICHE:
- One concise line: what the company does + for whom + core value.

NEGATIVE KEYWORDS:
- Wrong-match phrases: job seeking, vacancies, spam offers.
- Use [] if nothing obvious.

CHAT TOPICS:
- 5–10 themes of Telegram communities where potential BUYERS gather.
- Mix audience segments and adjacent contexts (e.g. for web agency: "Малый бизнес", "Маркетинг", "Интернет-магазины", "Предприниматели", "Стартапы") — not only the service niche label.

Output:
- Return ONLY valid JSON with EXACT keys: niche, summary, keywordGroups, negativeKeywords, chatTopics.
- keywordGroups must be an array of exactly 5 objects in the order listed above.
- No markdown, no comments, no extra keys, no reasoning text.`;

  const userPrompt = `Business description:
"""
${description}
"""

Return JSON with EXACT keys:
{
  "niche": string,
  "summary": string,
  "keywordGroups": [
    { "title": string, "description": string, "keywords": string[] }
  ],
  "negativeKeywords": string[],
  "chatTopics": string[]
}`;

  return { systemPrompt, userPrompt };
};
