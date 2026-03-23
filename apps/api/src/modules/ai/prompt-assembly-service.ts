import { getModeInstruction, serializeMessagesForPrompt, type ReplySuggestionMode } from "@repo/ai-core";
import { createHash } from "node:crypto";
import type { AIContext } from "./context-service.js";

export class PromptAssemblyService {
  build(params: {
    mode: ReplySuggestionMode;
    promptVersion: string;
    context: AIContext;
  }): {
    systemPrompt: string;
    promptHash: string;
  } {
    const baseSystemPrompt = `Вы — ИИ-помощник по продажам, который помогает менеджеру вести переписку с клиентами в мессенджере.

Ваша задача — предложить ОДИН готовый вариант ответа клиенту, который менеджер может отправить без изменений.

Вы НЕ отправляете сообщения автоматически — только предлагаете текст ответа.

---

## Стиль общения

Пишите как живой человек, а не как робот:
- естественно
- дружелюбно
- с лёгкими эмоциями (без перегиба)
- без канцелярита и шаблонных фраз

Избегайте:
- “Здравствуйте, благодарим вас за обращение”
- “Будем рады помочь”
- “Сообщаем вам, что...”

Предпочитайте:
- живой разговорный стиль
- короткие и понятные предложения
- ощущение диалога, а не ответа из скрипта

---

## Подход к продажам (важно)

Используйте мягкие техники продаж:

- сначала понять клиента
- уточнить потребность (если она не до конца ясна)
- показать ценность
- аккуратно подвести к следующему шагу (ответ, уточнение, действие)

Не давите и не продавайте агрессивно.

Если информации недостаточно — задавайте уточняющий вопрос вместо выдумывания ответа.

---

## Контекст

Всегда учитывайте:
- предыдущие сообщения в диалоге
- тон клиента (формальный / неформальный / раздражённый / заинтересованный)
- стадию диалога (первое сообщение / уточнение / почти покупка)

Подстраивайтесь под стиль клиента.

---

## Ограничения (строго)

- НЕ выдумывайте факты, цены, условия, сроки
- НЕ обещайте скидки или гарантии, если их нет в контексте
- НЕ придумывайте информацию о продукте
- если данных не хватает — задайте вопрос

---

## Формат ответа

- только текст сообщения клиенту
- без пояснений
- без вариантов
- без “вот пример ответа”

Ответ должен быть:
- готов к отправке
- логичный
- уместный в текущем диалоге

---

## Качество ответа

Хороший ответ:
- звучит как от человека
- двигает диалог вперёд
- не выглядит как шаблон
- не слишком длинный
- не слишком сухой

Если уместно — добавляйте:
- лёгкое вовлечение
- уточнение
- мягкий call-to-action

---

Ваша цель — помочь менеджеру вести диалог так, чтобы клиенту было комфортно и он двигался к решению (ответу, покупке или следующему шагу).`;

    const knowledgeBlock = params.context.knowledgeItems
      .map((item) => `- [${item.kind}] ${item.title}: ${item.content}`)
      .join("\n");

    const state = params.context.state;
    const stateBlock = [
      `leadStage: ${state?.leadStage ?? "UNKNOWN"}`,
      `leadTemperature: ${state?.leadTemperature ?? "UNKNOWN"}`,
      `lastClientIntent: ${state?.lastClientIntent ?? "UNKNOWN"}`,
      `nextRecommendedAction: ${state?.nextRecommendedAction ?? "UNKNOWN"}`,
      `isWaitingForReply: ${state?.isWaitingForReply ?? false}`
    ].join("\n");

    const policy = params.context.replyPolicy;
    const policyBlock = [
      `toneRules: ${JSON.stringify(policy?.toneRules ?? null)}`,
      `pricingRules: ${JSON.stringify(policy?.pricingRules ?? null)}`,
      `discountRules: ${JSON.stringify(policy?.discountRules ?? null)}`,
      `forbiddenPromises: ${JSON.stringify(policy?.forbiddenPromises ?? null)}`,
      `forbiddenTopics: ${JSON.stringify(policy?.forbiddenTopics ?? null)}`,
      `humanHandoffRules: ${JSON.stringify(policy?.humanHandoffRules ?? null)}`
    ].join("\n");

    const messagesBlock = serializeMessagesForPrompt(params.context.recentMessages);

    const systemPrompt = [
      `Prompt version: ${params.promptVersion}`,
      baseSystemPrompt,
      `Mode instruction: ${getModeInstruction(params.mode)}`,
      "",
      "Conversation state:",
      stateBlock,
      "",
      "Latest summary:",
      params.context.latestSummary ?? "No summary available.",
      "",
      "Knowledge base:",
      knowledgeBlock || "No active knowledge items.",
      "",
      "Reply policy:",
      policyBlock,
      "",
      "Recent messages:",
      messagesBlock || "No recent messages.",
      "",
      "Output requirements:",
      "Return JSON object with fields: suggestion (string), confidence (number optional)."
    ].join("\n");

    const hashMaterial = JSON.stringify({
      conversationId: params.context.conversation.id,
      lastMessageId: params.context.lastMessageId,
      mode: params.mode,
      promptVersion: params.promptVersion,
      knowledgeVersion: params.context.knowledgeVersion,
      replyPolicyVersion: params.context.replyPolicyVersion
    });

    const promptHash = createHash("sha256").update(hashMaterial).digest("hex");

    return {
      systemPrompt,
      promptHash
    };
  }
}
