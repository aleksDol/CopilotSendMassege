import test from "node:test";
import assert from "node:assert/strict";
import { PromptAssemblyService } from "./prompt-assembly-service.js";

function makeContext(overrides: Partial<any> = {}) {
  return {
    conversation: { id: "c1" },
    lastMessageId: "m-last",
    triggerMessageId: "m-last",
    knowledgeVersion: 1,
    replyPolicyVersion: 1,
    recentMessages: [
      { role: "user", content: "Привет! Сколько стоит?" },
      { role: "assistant", content: "Зависит от объёма." }
    ],
    latestSummary: null,
    knowledgeItems: [],
    replyPolicy: null,
    state: null,
    ...overrides
  };
}

test("PromptAssemblyService includes hidden sales analysis + strategy rules + output guard", () => {
  const svc = new PromptAssemblyService();
  const { userPrompt, systemPrompt } = svc.build({
    mode: "default",
    promptVersion: "test",
    context: makeContext() as any
  });

  assert.ok(userPrompt.includes("Hidden internal step (do NOT show this to the user):"));
  assert.ok(userPrompt.includes("ONE ACTION RULE"));
  assert.ok(systemPrompt.includes('Return ONLY a valid JSON object: {"suggestion":"...", "confidence":number|null}.'));
});

test("PromptAssemblyService does not duplicate serialized chat history in prompts", () => {
  const svc = new PromptAssemblyService();
  const context = makeContext({
    recentMessages: [
      { role: "user", content: "U1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "U2" }
    ]
  });

  const { userPrompt, systemPrompt } = svc.build({
    mode: "default",
    promptVersion: "test",
    context: context as any
  });

  assert.equal(userPrompt.includes("Recent messages:"), false);
  assert.equal(systemPrompt.includes("Recent messages:"), false);
});

test("PromptAssemblyService skips empty/fallback sections", () => {
  const svc = new PromptAssemblyService();
  const { userPrompt } = svc.build({
    mode: "default",
    promptVersion: "test",
    context: makeContext({
      latestSummary: null,
      knowledgeItems: []
    }) as any
  });

  assert.equal(userPrompt.includes("Conversation summary:"), false);
  assert.equal(userPrompt.includes("Relevant knowledge:"), false);
});
