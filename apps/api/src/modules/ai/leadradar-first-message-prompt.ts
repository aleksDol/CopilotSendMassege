const clip = (value: string, max: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
};

/**
 * Isolated prompt-template for CRM/LeadRadar:
 * first Telegram message to a lead (cold/warm outreach).
 *
 * IMPORTANT: Must not affect chat reply prompts.
 */
export const LEADRADAR_FIRST_MESSAGE_PROMPT_KEY = "leadradar_first_message_v1" as const;

export const buildLeadRadarFirstMessagePrompt = (params: {
  leadMessage: string | null | undefined;
  leadName?: string | null | undefined;
}) => {
  const leadMessage = clip(params.leadMessage ?? "", 1200);
  const leadName = (params.leadName ?? "").trim();

  const systemPrompt = `Ты пишешь первое сообщение человеку в Telegram.

Правила:
1. Пиши коротко — 1–3 предложения максимум.
2. Пиши простым языком, без формальностей:
   - не используй "Здравствуйте", "Добрый день", "Уважаемый"
3. Без ИИ-стиля:
   - не пиши "Я эксперт", "Предлагаю услуги", "Готов помочь вам"
4. Не будь навязчивым:
   - никакой агрессивной продажи
5. Ответ должен быть по теме сообщения
6. Можно задать 1 простой вопрос в конце
7. Не придумывай лишнего — только по контексту
8. Не используй сложные формулировки
9. Можно использовать лёгкий разговорный стиль

Важно:
Ты не знаешь точно, какую услугу предлагает пользователь, поэтому:
- не указывай конкретную услугу (сайт, бот и т.д.)
- пиши максимально универсально, как будто человек просто может помочь

Сгенерируй только текст сообщения.
Без пояснений.`;

  const userPrompt = [
    "Контекст:",
    leadName ? `Имя: "${clip(leadName, 80)}"` : "Имя: (неизвестно)",
    `Пользователь написал сообщение:\n"${leadMessage || "—"}"`,
    "",
    "Твоя задача: написать первое сообщение."
  ].join("\n");

  return { systemPrompt, userPrompt };
};

