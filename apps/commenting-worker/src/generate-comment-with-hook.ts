type HookType = "experience" | "insight" | "soft_offer" | "question";
type ToneMode = "neutral" | "expert" | "curiosity";

type GenerateCommentWithHookInput = {
  postText: string;
  toneMode?: ToneMode;
  niche?: string;
};

export type GenerateCommentWithHookResult = {
  comment: string;
  hookType: HookType;
  confidence: number;
  reason: string;
  model: string;
  attemptsUsed: number;
};

type OpenAIChatRequest = {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
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
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
  };
};

const HOOK_TYPES: HookType[] = ["experience", "insight", "soft_offer", "question"];
const TONE_MODES: ToneMode[] = ["neutral", "expert", "curiosity"];
const MAX_ATTEMPTS = 3; // initial + 2 retries

const PROMPT_VARIANTS = [
  "Use a fresh opener and avoid canned phrasing.",
  "Keep cadence conversational and slightly different from typical templates.",
  "Prefer concrete wording over abstract advice."
] as const;

const STRUCTURE_VARIANTS = [
  "Use either 1 sentence or 2 short sentences.",
  "Start with an observation, then a soft engagement line.",
  "Use a concise diagnostic style if it fits."
] as const;

const FORBIDDEN_PHRASE_PATTERNS: RegExp[] = [
  /\b(dm me|direct message me|write to me|message me privately)\b/i,
  /\b(i offer services|i provide services|my service|my agency)\b/i,
  /\b(book a call|let'?s work together|contact me for)\b/i,
  /\b(buy now|limited offer|special offer)\b/i
];

const GENERIC_FILLER_PATTERNS: RegExp[] = [
  /^(interesting post|great post|nice post|thanks for sharing|good point)[!. ]*$/i,
  /^(agree|totally agree|so true)[!. ]*$/i
];

const openerSignature = (text: string) =>
  text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");

const pickRotatedHook = (preferred?: HookType) => {
  if (preferred && HOOK_TYPES.includes(preferred)) return preferred;
  if (!generationMemory.lastHookType) {
    return HOOK_TYPES[Math.floor(Math.random() * HOOK_TYPES.length)];
  }
  const idx = HOOK_TYPES.indexOf(generationMemory.lastHookType);
  return HOOK_TYPES[(idx + 1) % HOOK_TYPES.length];
};

const normalizeToneMode = (raw?: string): ToneMode => {
  if (raw && TONE_MODES.includes(raw as ToneMode)) {
    return raw as ToneMode;
  }
  return "neutral";
};

const toneInstruction = (mode: ToneMode): string => {
  if (mode === "expert") {
    return "Tone: confident and practical, but still human and non-promotional.";
  }
  if (mode === "curiosity") {
    return "Tone: curious and exploratory, gently inviting discussion.";
  }
  return "Tone: balanced, natural, and neutral Telegram discussion style.";
};

const validateGeneratedComment = (comment: string): { ok: true } | { ok: false; reason: string } => {
  const normalized = comment.trim();
  if (!normalized.length) return { ok: false, reason: "empty_comment" };
  if (normalized.length > 300) return { ok: false, reason: "too_long" };
  if (FORBIDDEN_PHRASE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { ok: false, reason: "forbidden_sales_phrase" };
  }
  if (GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { ok: false, reason: "generic_filler" };
  }
  return { ok: true };
};

const generationMemory: {
  lastHookType: HookType | null;
  lastOpener: string | null;
} = {
  lastHookType: null,
  lastOpener: null
};

const buildSystemPrompt = (params: {
  toneMode: ToneMode;
  preferredHookType: HookType;
  bannedOpener?: string | null;
  promptVariant: string;
  structureVariant: string;
}) =>
  [
    "You generate Telegram comments for channel posts.",
    "Write short, natural comments that feel like a real participant, not an ad.",
    toneInstruction(params.toneMode),
    "Requirements:",
    "- 1 to 3 short sentences",
    "- max 300 characters",
    "- no direct selling, no aggressive CTA, no DM me, no I provide services, no spammy wording",
    "- should create curiosity or invite response",
    "- avoid generic filler like 'interesting post'",
    "- vary opening pattern and sentence structure so outputs do not feel templated",
    params.promptVariant,
    params.structureVariant,
    "Hook types:",
    "- experience: had a similar case...",
    "- insight: often the issue is...",
    "- soft_offer: if useful, I can share what helped",
    "- question: have you checked whether...?",
    `Prefer hook_type="${params.preferredHookType}" unless obviously mismatched.`,
    ...(params.bannedOpener ? [`Avoid starting with this opener pattern: "${params.bannedOpener}"`] : []),
    "Return ONLY valid JSON with fields: comment, hook_type, confidence, reason."
  ].join("\n");

const buildUserPrompt = (input: GenerateCommentWithHookInput) =>
  JSON.stringify(
    {
      post_text: input.postText,
      tone_mode: normalizeToneMode(input.toneMode),
      niche: input.niche ?? null
    },
    null,
    2
  );

const buildResponseFormat = () => ({
  type: "json_schema" as const,
  json_schema: {
    name: "telegram_comment_with_hook",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      required: ["comment", "hook_type", "confidence", "reason"],
      properties: {
        comment: { type: "string" },
        hook_type: { type: "string", enum: HOOK_TYPES },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reason: { type: "string" }
      }
    }
  }
});

const isHookType = (value: unknown): value is HookType =>
  typeof value === "string" && HOOK_TYPES.includes(value as HookType);

const parseResult = (raw: string): Omit<GenerateCommentWithHookResult, "model"> => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Model returned non-JSON content");
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model returned invalid object");
  }

  const record = parsed as Record<string, unknown>;
  const comment = typeof record.comment === "string" ? record.comment.trim() : "";
  const hookType = record.hook_type;
  const confidence = typeof record.confidence === "number" ? record.confidence : NaN;
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";

  if (!comment.length) {
    throw new Error("Generated comment is empty");
  }
  if (!isHookType(hookType)) {
    throw new Error("Generated hook_type is invalid");
  }
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    throw new Error("Generated confidence is invalid");
  }
  if (!reason.length) {
    throw new Error("Generated reason is empty");
  }
  const quality = validateGeneratedComment(comment);
  if (!quality.ok) {
    throw new Error(`Generated comment failed quality check: ${quality.reason}`);
  }

  return {
    comment,
    hookType,
    confidence,
    reason,
    attemptsUsed: 1
  };
};

const requestChatCompletion = async (params: {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  payload: OpenAIChatRequest;
}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);
  try {
    const response = await fetch(`${params.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${params.apiKey}`
      },
      body: JSON.stringify(params.payload),
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
};

export const generateCommentWithHook = async (
  params: GenerateCommentWithHookInput,
  runtime: {
    apiKey: string;
    model: string;
    baseUrl: string;
    timeoutMs: number;
  }
): Promise<GenerateCommentWithHookResult> => {
  const toneMode = normalizeToneMode(params.toneMode);
  const preferredHookType = pickRotatedHook();
  const bannedOpener = generationMemory.lastOpener;
  let lastError: string | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await requestChatCompletion({
        apiKey: runtime.apiKey,
        model: runtime.model,
        baseUrl: runtime.baseUrl,
        timeoutMs: runtime.timeoutMs,
        payload: {
          model: runtime.model,
          temperature: 0.7 + (attempt - 1) * 0.08,
          max_tokens: 220,
          response_format: buildResponseFormat(),
          messages: [
            {
              role: "system",
              content: buildSystemPrompt({
                toneMode,
                preferredHookType,
                bannedOpener,
                promptVariant: PROMPT_VARIANTS[(attempt - 1) % PROMPT_VARIANTS.length],
                structureVariant: STRUCTURE_VARIANTS[(attempt - 1) % STRUCTURE_VARIANTS.length]
              })
            },
            { role: "user", content: buildUserPrompt(params) }
          ]
        }
      });

      const content = completion.choices?.[0]?.message?.content?.trim() ?? "";
      const parsed = parseResult(content);
      const currentOpener = openerSignature(parsed.comment);
      if (currentOpener && bannedOpener && currentOpener === bannedOpener) {
        throw new Error("Generated comment repeated opener signature");
      }

      generationMemory.lastHookType = parsed.hookType;
      generationMemory.lastOpener = currentOpener || generationMemory.lastOpener;

      return {
        ...parsed,
        model: runtime.model,
        attemptsUsed: attempt
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(lastError ?? "comment_generation_invalid_after_retries");
};
