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

const HIDDEN_SALES_ANALYSIS_BLOCK = `Hidden internal step (do NOT show this to the user):

Before writing the final reply, the assistant must internally determine a sales analysis JSON object with this exact structure:

{
  "stage": "awareness | interest | consideration | decision | objection | closing",
  "missing": "clarity | trust | price | examples | simplicity | urgency | none",
  "strategy": "clarify | reduce_friction | build_trust | move_forward | handle_objection",
  "confidence": "low | medium | high"
}

Rules:
- This JSON is ONLY for internal reasoning.
- Do NOT include this JSON (or any analysis) in the final reply.
- Do NOT mention that this step exists.
- Keep the user-visible reply short (1–3 sentences) and natural.`;

const SALES_STRATEGY_RULES_BLOCK = `Use the internal sales analysis to shape the reply.

ONE ACTION RULE (very important):
- The final reply must do only ONE main thing: ask ONE question OR handle ONE objection OR reduce friction OR move forward OR clarify.
- Do NOT combine multiple strategies in one reply.

Strategy-specific rules (pick exactly ONE based on analysis.strategy):
- clarify:
  - use when the client's need/scope is unclear
  - ask ONE short, precise question
- reduce_friction:
  - make the next step feel easier
  - suggest ONE simple low-effort action
- build_trust:
  - add ONE small trust-building detail grounded in the provided context/knowledge
  - use examples/cases ONLY if they exist in the context/knowledge; do NOT invent cases
- move_forward:
  - gently move to the next step
  - propose ONE concrete next action
- handle_objection:
  - answer the objection directly
  - then (only if needed) ask ONE simple follow-up question

Missing-for-decision guidance (use analysis.missing to choose what to emphasize, without adding a second "main action"):
- clarity: explain simply what the client gets
- trust: add reassurance/proof only if grounded in context; do not make up proof
- price: do not avoid price forever; if price is unknown, ask what scope/package they need
- examples: offer to show an example only if examples exist in context/knowledge
- simplicity: reduce complexity and suggest a simple next step
- urgency: avoid fake urgency; mention timing only if it is relevant in context
- none: proceed naturally with the chosen strategy`;

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
  const toneRulesSanitized =
    policy?.toneRules && typeof policy.toneRules === "object" && !Array.isArray(policy.toneRules)
      ? (() => {
          const copy = { ...(policy.toneRules as Record<string, unknown>) };
          // Keep chat prompts stable: remove LeadRadar-only outreach playbook.
          delete (copy as any).aiBrainColdFirstTouch;
          return copy;
        })()
      : policy?.toneRules;
  if (toneRulesSanitized) blocks.push(`- Tone: ${clip(compactJson(toneRulesSanitized), 120)}`);
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

const pushSection = (parts: string[], title: string, body: string | null | undefined) => {
  const value = (body ?? "").trim();
  if (!value.length) return;
  parts.push(title, value, "", "---", "");
};

const isFallback = (value: string, fallback: string) => value.trim() === fallback.trim();

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
- Avoid stiff templates like "Здравствуйте"

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
- preferably under 350 characters
- no emojis
- no lists
- no formatting
- no prefixes like "Ответ:" or "Сообщение:"

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
- The reply must feel natural and believable

Output guard:
- The final answer must contain ONLY the message to send to the client.
- No analysis, no explanations, no labels, no markdown, no multiple options.`;

    const selectedKnowledge = selectRelevantKnowledge(params.context);
    const selectedKnowledgeItems = selectedKnowledge.items;

    const state = params.context.state;
    const stateBlock = [
      `leadStage: ${state?.leadStage ?? "UNKNOWN"}`,
      `leadTemperature: ${state?.leadTemperature ?? "UNKNOWN"}`,
      `lastClientIntent: ${state?.lastClientIntent ?? "UNKNOWN"}`,
      `nextRecommendedAction: ${state?.nextRecommendedAction ?? "UNKNOWN"}`,
      `isWaitingForReply: ${state?.isWaitingForReply ?? false}`
    ].join("\n");

    const policy = params.context.replyPolicy;
    const toneRulesSanitized =
      policy?.toneRules && typeof policy.toneRules === "object" && !Array.isArray(policy.toneRules)
        ? (() => {
            const copy = { ...(policy.toneRules as Record<string, unknown>) };
            // Keep chat prompts stable: remove LeadRadar-only outreach playbook.
            delete (copy as any).aiBrainColdFirstTouch;
            return copy;
          })()
        : policy?.toneRules;
    const policyBlock = [
      `toneRules: ${JSON.stringify(toneRulesSanitized ?? null)}`,
      `pricingRules: ${JSON.stringify(policy?.pricingRules ?? null)}`,
      `discountRules: ${JSON.stringify(policy?.discountRules ?? null)}`,
      `forbiddenPromises: ${JSON.stringify(policy?.forbiddenPromises ?? null)}`,
      `forbiddenTopics: ${JSON.stringify(policy?.forbiddenTopics ?? null)}`,
      `humanHandoffRules: ${JSON.stringify(policy?.humanHandoffRules ?? null)}`
    ].join("\n");

    const conversationSummaryRaw = params.context.latestSummary ?? "";
    const conversationSummary = clip(conversationSummaryRaw.trim().length ? conversationSummaryRaw : "No summary available.", MAX_SUMMARY_CHARS);
    const productDescription = buildProductDescription(params.context);
    const goal = buildGoal(params.context);
    const strategy = buildStrategy({ context: params.context, mode: params.mode });
    const relevantKnowledge = buildRelevantKnowledge(selectedKnowledgeItems);

    const userParts: string[] = [];
    if (!isFallback(conversationSummary, "No summary available.")) {
      pushSection(userParts, "Conversation summary:", conversationSummary);
    }

    // AI Brain: keep only meaningful parts to reduce noise.
    const brainParts: string[] = [];
    if (!isFallback(productDescription, PRODUCT_FALLBACK)) brainParts.push("Product:", productDescription, "");
    if (!isFallback(goal, GOAL_FALLBACK)) brainParts.push("Goal:", goal, "");
    if (!isFallback(strategy, STRATEGY_FALLBACK)) brainParts.push("Strategy:", strategy, "");
    if (!isFallback(relevantKnowledge, RELEVANT_KNOWLEDGE_FALLBACK)) brainParts.push("Relevant knowledge:", relevantKnowledge, "");

    if (brainParts.length) {
      userParts.push("AI Brain:", "", ...brainParts, "---", "");
    }

    userParts.push(HIDDEN_SALES_ANALYSIS_BLOCK, "", SALES_STRATEGY_RULES_BLOCK, "", "---", "");

    // Compact decision reminder (no duplication of history; chat messages are provided separately).
    userParts.push(
      "Write the reply as a quick chat message that moves the conversation one step forward.",
      "Keep it 1–3 sentences, natural Russian, no pressure.",
      "Return ONLY the message text."
    );

    const userPrompt = userParts.join("\n");

    const systemPrompt = [
      `Prompt version: ${params.promptVersion}`,
      baseSystemPrompt,
      `Mode instruction: ${getModeInstruction(params.mode)}`,
      "",
      "Conversation state:",
      stateBlock,
      "",
      "Reply policy:",
      policyBlock,
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
