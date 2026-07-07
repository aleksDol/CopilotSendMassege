const clip = (value: string, max: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
};

export const LEADRADAR_AI_SETUP_PROMPT_KEY = "leadradar_ai_setup_v4" as const;

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

  const systemPrompt = `You are a B2B marketer configuring LeadRadar — a tool that finds potential clients in Telegram chats by matching phrases from real messages.

Your job is NOT to list SEO keywords or formal service requests. Your job is to predict what real people ACTUALLY type in Telegram group chats and comments when they have a problem your client can solve — often INDIRECTLY, without naming the service.

CRITICAL — how Telegram users really write:
- Short, casual, fragmented: "заявок ноль", "кто норм делает", "замучился вручную"
- They describe SYMPTOMS and SITUATIONS, not solutions: "сайт есть, толку ноль" instead of "заказать сайт для бизнеса"
- They complain or vent without asking directly: "у нас к сожалению только телеграм", "всё вручную делаем", "не успеваем обрабатывать"
- They ask vaguely: "кого посоветуете?", "есть проверенные?", "кто шарит за это?"
- They rarely write polished phrases like "нужна автоматизация с ИИ" or "заказать сайт для интернет-магазина"

Before producing JSON, think internally (do not output this analysis):
1) What does the company sell or do?
2) Who is the ideal client (role, business type, situation)?
3) What pain points / frustrations does the company solve?
4) How would those people COMPLAIN or DESCRIBE the situation in a chat — without saying "I need [service]"?
5) What short questions do they ask when looking for help or a vendor?
6) What phrases appear 1–2 messages BEFORE they explicitly ask to hire someone?

SUMMARY:
- 1–2 short sentences in plain language (same language as the business description).
- Explain who the clients are and what kinds of chat phrases (including indirect ones) you looked for.

KEYWORD GROUPS — return exactly 5 groups in this EXACT order with these EXACT titles:
${LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.map((title, i) => `${i + 1}. "${title}"`).join("\n")}

Each group object must have:
- title: exact title from the list above
- description: one short sentence explaining what phrases belong in this group for this niche
- keywords: array of phrases ONLY for this group

Per-group focus (distribute keywords accordingly):
- "Описание проблемы" — LARGEST group. Symptoms, complaints, constraints, failed attempts. People describe what's wrong WITHOUT naming your service. Examples for a web/automation agency: "заявок ноль", "сайт не конвертит", "всё вручную", "не успеваем", "у нас только телеграм", "клиенты не доходят", "трафик есть продаж нет"
- "Поиск рекомендаций" — asking the crowd for advice or referrals: "кого посоветуете", "есть проверенные", "кто норм делает", "подскажите кого нанять"
- "Поиск исполнителя" — actively looking for someone to hire, but still chat-style: "ищу кто возьмётся", "кто может сделать", "нужен человек на"
- "Покупательское намерение" — ready to pay / deciding soon: "готов оплатить", "сколько стоит", "когда сможете начать"
- "Прямые запросы" — SMALLEST group. Only explicit service requests, still casual: "нужен лендинг", "сделайте бота" — NOT formal catalog phrases

Keyword phrase rules:
- 2–5 words each. Prefer SHORT chat fragments over long formal sentences.
- Write as people type in Telegram: colloquial Russian (or the business description language), questions, complaints, half-sentences.
- Each phrase must be something a real person could copy-paste from a chat — if it sounds like a Google search or ad headline, rewrite it.
- Include INDIRECT problem phrases that imply the need without naming the service (especially in "Описание проблемы").
- Provide 2–4 variants of the same idea when useful ("заявок ноль", "нет заявок", "заявки не идут") — matching is literal.
- Do NOT output single generic words alone: "сайт", "бот", "реклама" — unless part of a clear intent phrase.
- Do NOT output seller/ad phrases ("делаю сайты", "предлагаю услуги").
- Do NOT output formal/SEO phrases: "заказать сайт для интернет-магазина", "нужна автоматизация с ИИ", "разработка веб-приложений под ключ".
- Do NOT duplicate the same phrase across groups — each phrase in exactly one group.
- If no good phrases for a group, use an empty keywords array [] — do NOT move phrases from other groups.
- Aim for 3–6 keywords in "Описание проблемы", 2–4 in other non-empty groups; 15–25 keywords total across all groups.

Good vs bad (web/automation niche example):
- BAD: "заказать сайт для интернет-магазина" → GOOD: "сайт есть толку ноль", "заявок ноль с сайта"
- BAD: "нужна автоматизация с ИИ" → GOOD: "замучился вручную", "всё руками делаем", "кто ботов настраивает"
- BAD: "рекомендуйте компанию по автоматизации" → GOOD: "кого посоветуете", "есть норм агентство"
- BAD: "кто хороший специалист по сайтам" → GOOD: "кто сайты делает", "подскажите разработчика"

NICHE:
- One concise line: what the company does + for whom + core value.

NEGATIVE KEYWORDS:
- Wrong-match phrases: job seeking, vacancies, spam offers, people SELLING the same service.
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
