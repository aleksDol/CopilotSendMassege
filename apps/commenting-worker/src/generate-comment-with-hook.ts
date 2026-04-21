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
  wasRegenerated: boolean;
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
  if (normalized.length > 220) return { ok: false, reason: "too_long" };
  if (FORBIDDEN_PHRASE_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { ok: false, reason: "forbidden_sales_phrase" };
  }
  if (GENERIC_FILLER_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return { ok: false, reason: "generic_filler" };
  }
  return { ok: true };
};

const shouldRegenerateDueToBannedPhrases = (comment: string): boolean => {
  const normalized = comment.trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("часто") ||
    normalized.includes("многие") ||
    normalized.includes("в большинстве") ||
    normalized.includes("как правило") ||
    normalized.includes("интересно какие")
  );
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
    "You are writing short Telegram comments as a real person participating in a discussion.",
    "",
    "Your goal is to write a natural, human-like comment that feels real and can slightly hook the reader into replying.",
    "",
    "---",
    "",
    "Language rule:",
    "",
    "- Always write the comment in the same language as the original post.",
    "- If the post is in Russian, the comment MUST be in Russian.",
    "- Do NOT mix languages.",
    "- If language is unclear, default to Russian.",
    "",
    "---",
    "",
    "Style rules:",
    "",
    "- Write like a real person, not like an article or assistant",
    "- Avoid formal tone",
    "- Avoid generic explanations",
    "- Avoid “teaching” or sounding like documentation",
    "- Do NOT sound like AI",
    "",
    "---",
    "",
    "Strictly avoid starting with:",
    "",
    "- “Часто…”",
    "- “Многие…”",
    "- “В большинстве случаев…”",
    "- “Как правило…”",
    "- “Интересно, какие…”",
    "",
    "---",
    "",
    "Instead:",
    "",
    "- Use personal or implied experience:",
    '  - “была похожая ситуация”',
    '  - “сталкивались с таким”',
    '  - “у нас как-то было”',
    '  - “помню, было похожее”',
    "",
    "- Add a small insight or twist:",
    "  - hint that the problem might be deeper",
    "  - suggest that the real issue may be somewhere unexpected",
    "",
    "- Optionally add a soft hook:",
    '  - “в итоге оказалось, что…”',
    '  - “оказалось не там, где сначала искали”',
    '  - “интересный момент был в том, что…”',
    "",
    "---",
    "",
    "Output constraints:",
    "",
    "- 1–3 short sentences",
    "- maximum 220 characters",
    "- simple conversational language",
    "- no emojis",
    "- no hashtags",
    "- no formatting",
    "- no lists",
    "",
    "---",
    "",
    "STRICTLY FORBIDDEN:",
    "",
    "- “напишите в личку”",
    "- “могу помочь”",
    "- “я эксперт”",
    "- “обращайтесь”",
    "- any direct selling or promotion",
    "- any call-to-action",
    "",
    "---",
    "",
    "Critical behavior:",
    "",
    "- Write as if typing quickly in a chat",
    "- Slightly informal is good",
    "- Do NOT over-explain",
    "- Do NOT try to sound smart",
    "- It should feel like a quick human thought, not a polished answer",
    "",
    "---",
    "",
    "Bad example:",
    "“Часто люди не понимают, как это работает. Интересно, какие факторы могут влиять...”",
    "",
    "Good example:",
    "“Была похожая ситуация, тоже сначала не туда копали",
    "в итоге оказалось, что проблема вообще была в другом месте”",
    "",
    "---",
    "",
    "Final requirement:",
    "",
    "The comment must feel:",
    "- natural",
    "- slightly imperfect",
    "- believable as a real Telegram user",
    "",
    ...(params.bannedOpener ? [`Avoid starting with this opener pattern: "${params.bannedOpener}"`] : []),
    params.promptVariant,
    params.structureVariant,
    toneInstruction(params.toneMode),
    `Prefer hook_type="${params.preferredHookType}" unless obviously mismatched.`
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

const parseResult = (raw: string): Omit<GenerateCommentWithHookResult, "model" | "wasRegenerated"> => {
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
  const hookTypeRaw = record.hook_type;
  const confidence = typeof record.confidence === "number" ? record.confidence : NaN;
  const reason = typeof record.reason === "string" ? record.reason.trim() : "";

  if (!comment.length) {
    throw new Error("Generated comment is empty");
  }
  if (!isHookType(hookTypeRaw)) {
    throw new Error("Generated hook_type is invalid");
  }
  const hookType = hookTypeRaw as HookType;
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
  let wasRegenerated = false;
  let lastGeneratedComment: string | null = null;

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
      lastGeneratedComment = parsed.comment;
      const currentOpener = openerSignature(parsed.comment);
      if (currentOpener && bannedOpener && currentOpener === bannedOpener) {
        throw new Error("Generated comment repeated opener signature");
      }

      generationMemory.lastHookType = parsed.hookType;
      generationMemory.lastOpener = currentOpener || generationMemory.lastOpener;

      if (!wasRegenerated && shouldRegenerateDueToBannedPhrases(parsed.comment)) {
        wasRegenerated = true;
        continue;
      }

      return {
        ...parsed,
        model: runtime.model,
        attemptsUsed: attempt,
        wasRegenerated
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  if (wasRegenerated && lastGeneratedComment && shouldRegenerateDueToBannedPhrases(lastGeneratedComment)) {
    return {
      comment: lastGeneratedComment,
      hookType: preferredHookType,
      confidence: 0.35,
      reason: "Regeneration requested by banned phrase check, but output still contained a banned phrase. Accepting with warning.",
      model: runtime.model,
      attemptsUsed: MAX_ATTEMPTS,
      wasRegenerated: true
    };
  }

  throw new Error(lastError ?? "comment_generation_invalid_after_retries");
};
