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
      "You are an AI sales copilot helping a human manager write a direct reply to a client in chat.",
      "You never send messages automatically; you only suggest one reply text.",
      "Do not invent facts or prices. Do not promise discounts, deadlines, or guarantees unless supported by context.",
      "Keep response practical and ready to send as-is.",
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
