import type { AIMessage, ReplySuggestionMode } from "./types.js";

const modeInstructions: Record<ReplySuggestionMode, string> = {
  default: "Write a balanced, clear, practical reply.",
  shorter: "Make the reply shorter and concise while keeping clarity.",
  more_friendly: "Make the reply warmer, friendlier, and supportive.",
  more_sales: "Make the reply more sales-oriented, but never aggressive or pushy.",
  handle_objection:
    "Focus on objection handling: acknowledge concern, answer clearly, and move to a next step."
};

export const getModeInstruction = (mode: ReplySuggestionMode): string => modeInstructions[mode];

export const serializeMessagesForPrompt = (messages: AIMessage[]): string =>
  messages
    .map((message, index) => `[${index + 1}] ${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");
