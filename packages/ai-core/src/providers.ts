import type { AIMessage, GenerateReplyInput, GenerateReplyResult } from "./types.js";

export interface LLMCompletionOptions {
  messages: AIMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  complete(options: LLMCompletionOptions): Promise<string>;
  generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult>;
}

export interface EmbeddingProvider {
  embed(input: string | string[]): Promise<number[][]>;
}
