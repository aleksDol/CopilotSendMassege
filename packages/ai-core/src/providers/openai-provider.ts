import type {
  AIMessage,
  GenerateReplyInput,
  GenerateReplyResult,
  ProviderResultMetadata
} from "../types.js";
import type { LLMCompletionOptions, LLMProvider } from "../providers.js";

type OpenAIProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
  timeoutMs?: number;
};

type OpenAIChatRequest = {
  model: string;
  messages: Array<{ role: AIMessage["role"]; content: string }>;
  temperature?: number;
  max_tokens?: number;
  response_format?: {
    type: "json_schema";
    json_schema: {
      name: string;
      strict: boolean;
      schema: Record<string, unknown>;
    };
  };
};

type OpenAIChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

const parseJsonSuggestion = (content: string): { text: string; confidence?: number } => {
  try {
    const parsed = JSON.parse(content) as { suggestion?: string; confidence?: number };
    if (parsed.suggestion && typeof parsed.suggestion === "string") {
      return {
        text: parsed.suggestion.trim(),
        confidence: typeof parsed.confidence === "number" ? parsed.confidence : undefined
      };
    }
  } catch {
    // fall through
  }

  return {
    text: content.trim()
  };
};

const buildStructuredResponseFormat = () => ({
  type: "json_schema" as const,
  json_schema: {
    name: "reply_suggestion",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        suggestion: {
          type: "string"
        },
        confidence: {
          type: "number"
        }
      },
      required: ["suggestion"]
    }
  }
});

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(config: OpenAIProviderConfig) {
    this.apiKey = config.apiKey;
    this.model = config.model;
    this.baseUrl = config.baseUrl ?? "https://api.openai.com/v1";
    this.timeoutMs = config.timeoutMs ?? 30000;
  }

  async complete(options: LLMCompletionOptions): Promise<string> {
    const response = await this.requestChatCompletion({
      model: this.model,
      messages: options.messages,
      temperature: options.temperature,
      max_tokens: options.maxTokens
    });

    const content = response.choices?.[0]?.message?.content;
    return (content ?? "").trim();
  }

  async generateReply(input: GenerateReplyInput): Promise<GenerateReplyResult> {
    const startedAt = Date.now();

    const completion = await this.requestChatCompletion({
      model: this.model,
      messages: [
        { role: "system", content: input.systemPrompt },
        ...input.messages
      ],
      temperature: input.temperature,
      max_tokens: input.maxTokens,
      response_format: buildStructuredResponseFormat()
    });

    const content = completion.choices?.[0]?.message?.content?.trim() ?? "";
    const parsed = parseJsonSuggestion(content);

    const metadata: ProviderResultMetadata = {
      provider: "openai",
      model: this.model,
      inputTokens: completion.usage?.prompt_tokens,
      outputTokens: completion.usage?.completion_tokens,
      finishReason: completion.choices?.[0]?.finish_reason ?? undefined,
      latencyMs: Date.now() - startedAt
    };

    return {
      text: parsed.text,
      confidence: parsed.confidence,
      metadata
    };
  }

  private async requestChatCompletion(payload: OpenAIChatRequest): Promise<OpenAIChatResponse> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(payload),
        signal: controller.signal
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenAI request failed: ${response.status} ${body}`);
      }

      return (await response.json()) as OpenAIChatResponse;
    } finally {
      clearTimeout(timer);
    }
  }
}
