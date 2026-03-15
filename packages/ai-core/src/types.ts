export type AIMessageRole = "system" | "user" | "assistant";

export type AIMessage = {
  role: AIMessageRole;
  content: string;
};

export type ReplySuggestionMode =
  | "default"
  | "shorter"
  | "more_friendly"
  | "more_sales"
  | "handle_objection";

export type ProviderResultMetadata = {
  provider: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs?: number;
  finishReason?: string;
  raw?: unknown;
};

export type GenerateReplyInput = {
  mode: ReplySuggestionMode;
  systemPrompt: string;
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
  responseLanguage?: string;
};

export type GenerateReplyResult = {
  text: string;
  confidence?: number;
  metadata: ProviderResultMetadata;
};
