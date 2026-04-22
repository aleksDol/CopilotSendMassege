import { getModeInstruction, serializeMessagesForPrompt, type ReplySuggestionMode } from "@repo/ai-core";
import { createHash } from "node:crypto";
import type { AIContext } from "./context-service.js";

const PRODUCT_FALLBACK = "No explicit product description available.";
const GOAL_FALLBACK = "Move the conversation one step forward with a useful next action.";
const STRATEGY_FALLBACK = "Use a calm, consultative approach and reduce uncertainty before pushing decisions.";
const RELEVANT_KNOWLEDGE_FALLBACK = "No relevant knowledge available.";
const MAX_RECENT_MESSAGES = 10;
const MAX_PRODUCT_LINES = 2;
const MAX_RELEVANT_KNOWLEDGE_BLOCKS = 3;
const MAX_BLOCK_CHARS = 420;
const MAX_SUMMARY_CHARS = 600;
const MAX_LAST_MESSAGE_CHARS = 500;
const MAX_GOAL_CHARS = 180;
const MAX_STRATEGY_CHARS = 380;
const MAX_PRODUCT_LINE_CHARS = 180;

type KnowledgeIntentType = "pricing" | "objections" | "features" | "cases";

const PRICE_SIGNALS = [
  "price",
  "pricing",
  "cost",
  "budget",
  "quote",
  "how much",
  "цена",
  "стоимость",
  "сколько",
  "прайс",
  "тариф",
  "дорого"
];

const OBJECTION_SIGNALS = [
  "not sure",
  "doubt",
  "worried",
  "concern",
  "risk",
  "too expensive",
  "сомнева",
  "не уверен",
  "боюсь",
  "дорого",
  "риск",
  "возраж"
];

const FEATURE_SIGNALS = [
  "what can",
  "can you do",
  "feature",
  "function",
  "how does it work",
  "как работает",
  "что уме",
  "возможност",
  "функц"
];

const CASE_SIGNALS = [
  "case",
  "example",
  "portfolio",
  "results",
  "experience",
  "кейс",
  "пример",
  "опыт",
  "отзыв",
  "результат"
];

const clip = (value: string, max: number): string => {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max)}...`;
};

const compactJson = (value: unknown): string => JSON.stringify(value ?? null);

const toKnowledgeLine = (item: AIContext["knowledgeItems"][number]): string =>
  `- [${item.kind}] ${item.title}: ${clip(item.content, MAX_BLOCK_CHARS)}`;

const normalize = (value: string): string => value.toLowerCase();

const hasAnySignal = (text: string, signals: string[]): boolean => {
  const normalized = normalize(text);
  return signals.some((signal) => normalized.includes(signal));
};

const detectIntentTypes = (context: AIContext): Set<KnowledgeIntentType> => {
  const recent = context.recentMessages.slice(-4).map((message) => message.content).join("\n");
  const lastMessage = getLastClientMessage(context);
  const haystack = `${lastMessage}\n${recent}`;
  const selected = new Set<KnowledgeIntentType>();

  if (hasAnySignal(haystack, PRICE_SIGNALS)) selected.add("pricing");
  if (hasAnySignal(haystack, OBJECTION_SIGNALS)) selected.add("objections");
  if (hasAnySignal(haystack, FEATURE_SIGNALS)) selected.add("features");
  if (hasAnySignal(haystack, CASE_SIGNALS)) selected.add("cases");

  return selected;
};

const classifyKnowledgeItem = (item: AIContext["knowledgeItems"][number]): Set<KnowledgeIntentType> => {
  const text = `${item.title}\n${item.content}`;
  const tags = new Set<KnowledgeIntentType>();

  if (item.kind === "PRODUCT" || hasAnySignal(text, FEATURE_SIGNALS)) tags.add("features");
  if (item.kind === "POLICY" || hasAnySignal(text, PRICE_SIGNALS)) tags.add("pricing");
  if (item.kind === "FAQ" || hasAnySignal(text, OBJECTION_SIGNALS)) tags.add("objections");
  if (item.kind === "SCRIPT" || hasAnySignal(text, CASE_SIGNALS)) tags.add("cases");
  if (hasAnySignal(text, CASE_SIGNALS)) tags.add("cases");
  if (hasAnySignal(text, OBJECTION_SIGNALS)) tags.add("objections");
  if (hasAnySignal(text, PRICE_SIGNALS)) tags.add("pricing");

  return tags;
};

const selectRelevantKnowledge = (context: AIContext): {
  selectedTypes: KnowledgeIntentType[];
  items: AIContext["knowledgeItems"];
} => {
  const detected = detectIntentTypes(context);
  if (!detected.size) {
    return { selectedTypes: [], items: [] };
  }

  const selected: AIContext["knowledgeItems"] = [];
  const includedTypes = new Set<KnowledgeIntentType>();
  for (const item of context.knowledgeItems) {
    if (selected.length >= MAX_RELEVANT_KNOWLEDGE_BLOCKS) break;
    const itemTags = classifyKnowledgeItem(item);
    const intersects = Array.from(detected).some((intent) => itemTags.has(intent));
    if (intersects) {
      selected.push(item);
      for (const tag of itemTags) {
        if (detected.has(tag)) includedTypes.add(tag);
      }
    }
  }

  return {
    selectedTypes: Array.from(includedTypes),
    items: selected
  };
};

const limitRecentMessages = (context: AIContext) => context.recentMessages.slice(-MAX_RECENT_MESSAGES);

const buildProductDescription = (context: AIContext): string => {
  const productItems = context.knowledgeItems.filter((item) => item.kind === "PRODUCT");
  const source = productItems.length > 0 ? productItems : context.knowledgeItems.slice(0, 3);
  if (!source.length) return PRODUCT_FALLBACK;
  return source
    .slice(0, MAX_PRODUCT_LINES)
    .map((item) => `- ${item.title}: ${clip(item.content, MAX_PRODUCT_LINE_CHARS)}`)
    .join("\n");
};

const buildGoal = (context: AIContext): string => {
  const candidate = context.state?.nextRecommendedAction?.trim();
  if (candidate) return clip(candidate, MAX_GOAL_CHARS);
  return GOAL_FALLBACK;
};

const buildStrategy = (params: { context: AIContext; mode: ReplySuggestionMode }): string => {
  const policy = params.context.replyPolicy;
  const blocks = [`- Mode: ${getModeInstruction(params.mode)}`];
  if (policy?.toneRules) blocks.push(`- Tone: ${clip(compactJson(policy.toneRules), 120)}`);
  if (policy?.pricingRules) blocks.push(`- Pricing: ${clip(compactJson(policy.pricingRules), 110)}`);
  if (policy?.discountRules) blocks.push(`- Discounts: ${clip(compactJson(policy.discountRules), 110)}`);
  if (policy?.forbiddenPromises) blocks.push("- Respect forbidden promises.");
  if (policy?.humanHandoffRules) blocks.push("- Escalate to human when policy requires.");

  const normalized = blocks.join("\n").trim();
  return normalized.length ? clip(normalized, MAX_STRATEGY_CHARS) : STRATEGY_FALLBACK;
};

const buildRelevantKnowledge = (source: AIContext["knowledgeItems"]): string => {
  if (!source.length) return RELEVANT_KNOWLEDGE_FALLBACK;
  return source.map((item) => toKnowledgeLine(item)).join("\n");
};

const getLastClientMessage = (context: AIContext): string => {
  for (let i = context.recentMessages.length - 1; i >= 0; i -= 1) {
    const message = context.recentMessages[i];
    if (message.role === "user" && message.content.trim().length > 0) {
      return clip(message.content, MAX_LAST_MESSAGE_CHARS);
    }
  }
  return "No explicit client message found in recent messages.";
};

export class PromptAssemblyService {
  build(params: {
    mode: ReplySuggestionMode;
    promptVersion: string;
    context: AIContext;
  }): {
    systemPrompt: string;
    userPrompt: string;
    promptDebug: {
      hasProduct: boolean;
      hasGoal: boolean;
      hasStrategy: boolean;
      hasRelevantKnowledge: boolean;
      selectedKnowledgeTypes: KnowledgeIntentType[];
      knowledgeBlocksCount: number;
      promptEstimatedSize: number;
    };
    promptHash: string;
  } {
    const baseSystemPrompt = `You are writing short Telegram replies as a real person in a chat conversation.

Your goal is to respond naturally, like a human, while helping move the conversation forward.

Language rule:
- Always reply in the same language as the client message
- If unclear, default to Russian
- Do NOT mix languages

Style rules:
- Write like a real person, not like an assistant
- Avoid formal tone
- Avoid generic phrases
- Avoid sounding like documentation or AI

Strictly avoid starting with:
- "Р§Р°СЃС‚Рѕ..."
- "РњРЅРѕРіРёРµ..."
- "Р’ Р±РѕР»СЊС€РёРЅСЃС‚РІРµ СЃР»СѓС‡Р°РµРІ..."
- "РљР°Рє РїСЂР°РІРёР»Рѕ..."
- "РРЅС‚РµСЂРµСЃРЅРѕ, РєР°РєРёРµ..."

Instead:
- Use natural phrasing
- Allow slight informality
- Sound like a quick chat reply

Output constraints:
- 1-3 sentences
- concise and clear
- no emojis
- no lists
- no formatting

STRICTLY FORBIDDEN:
- "РЅР°РїРёС€РёС‚Рµ РІ Р»РёС‡РєСѓ"
- "РјРѕРіСѓ РїРѕРјРѕС‡СЊ"
- "СЏ СЌРєСЃРїРµСЂС‚"
- "РѕР±СЂР°С‰Р°Р№С‚РµСЃСЊ"
- any aggressive selling

Critical behavior:
- Do NOT over-explain
- Do NOT try to sound smart
- Write as if typing quickly in chat
- The reply must feel natural and believable`;

    const limitedRecentMessages = limitRecentMessages(params.context);
    const selectedKnowledge = selectRelevantKnowledge(params.context);
    const selectedKnowledgeItems = selectedKnowledge.items;

    const knowledgeBlock = selectedKnowledgeItems
      .map((item) => `- [${item.kind}] ${item.title}: ${clip(item.content, MAX_BLOCK_CHARS)}`)
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

    const messagesBlock = serializeMessagesForPrompt(limitedRecentMessages);
    const conversationSummary = clip(params.context.latestSummary ?? "No summary available.", MAX_SUMMARY_CHARS);
    const lastClientMessage = getLastClientMessage(params.context);
    const productDescription = buildProductDescription(params.context);
    const goal = buildGoal(params.context);
    const strategy = buildStrategy({ context: params.context, mode: params.mode });
    const relevantKnowledge = buildRelevantKnowledge(selectedKnowledgeItems);

    const userPrompt = [
      "Conversation summary:",
      conversationSummary,
      "",
      "---",
      "",
      "Recent messages:",
      messagesBlock || "No recent messages.",
      "",
      "---",
      "",
      "Client last message:",
      lastClientMessage,
      "",
      "---",
      "",
      "AI Brain:",
      "",
      "Product:",
      productDescription,
      "",
      "Goal:",
      goal,
      "",
      "Strategy:",
      strategy,
      "",
      "Relevant knowledge:",
      relevantKnowledge,
      "",
      "---",
      "",
      "Before writing the reply, think step-by-step:",
      "",
      "1. What does the client want right now?",
      "2. What problem are they trying to solve?",
      "3. What stage are they in?",
      "   - cold",
      "   - interested",
      "   - considering",
      "   - objection",
      "   - ready",
      "",
      "4. Identify:",
      "   - their main pain",
      "   - possible doubts or fears",
      "   - approximate level (cheap / medium / premium)",
      "",
      "5. Decide what to do next:",
      "   - ask a question?",
      "   - clarify the task?",
      "   - reduce doubt?",
      "   - give a small insight?",
      "   - move toward the goal?",
      "",
      "6. IMPORTANT:",
      "   - do NOT rush to give price unless appropriate",
      "   - do NOT push aggressively",
      "   - follow the Strategy from AI Brain",
      "   - move the conversation one step forward",
      "",
      "Now write the reply:",
      "",
      "- short (1-3 sentences)",
      "- natural",
      "- human-like",
      "- slightly informal",
      "- no sales pressure",
      "- no generic phrases",
      "- no AI tone",
      "",
      "The reply must:",
      "- match the client's level",
      "- feel like a real chat message",
      "- help move the conversation toward the Goal"
    ].join("\n");

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
      promptTemplateVersion: "copilot_user_prompt_v1",
      knowledgeVersion: params.context.knowledgeVersion,
      replyPolicyVersion: params.context.replyPolicyVersion
    });

    const promptHash = createHash("sha256").update(hashMaterial).digest("hex");
    const promptEstimatedSize = systemPrompt.length + userPrompt.length;

    return {
      systemPrompt,
      userPrompt,
      promptDebug: {
        hasProduct: productDescription !== PRODUCT_FALLBACK,
        hasGoal: goal !== GOAL_FALLBACK,
        hasStrategy: strategy !== STRATEGY_FALLBACK,
        hasRelevantKnowledge: selectedKnowledgeItems.length > 0,
        selectedKnowledgeTypes: selectedKnowledge.selectedTypes,
        knowledgeBlocksCount: selectedKnowledgeItems.length,
        promptEstimatedSize
      },
      promptHash
    };
  }
}
