import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadRadarAiSetupPrompt,
  LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES,
  LEADRADAR_AI_SETUP_PROMPT_KEY
} from "./leadradar-ai-setup-prompts.js";

test("ai setup prompt requests grouped JSON contract", () => {
  const { systemPrompt, userPrompt } = buildLeadRadarAiSetupPrompt({
    description: "Делаю сайты для малого бизнеса."
  });

  assert.ok(systemPrompt.includes("Return ONLY valid JSON"));
  assert.ok(userPrompt.includes("Делаю сайты для малого бизнеса."));
  assert.ok(userPrompt.includes('"summary"'));
  assert.ok(userPrompt.includes('"keywordGroups"'));
  assert.ok(userPrompt.includes('"chatTopics"'));
});

test("ai setup prompt guides marketer-style buyer-intent keyword groups", () => {
  const { systemPrompt } = buildLeadRadarAiSetupPrompt({
    description: "Делаю сайты для малого бизнеса."
  });

  assert.equal(LEADRADAR_AI_SETUP_PROMPT_KEY, "leadradar_ai_setup_v3");
  assert.equal(LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.length, 5);
  assert.ok(systemPrompt.includes("B2B marketer"));
  assert.ok(systemPrompt.includes("Поиск исполнителя"));
  assert.ok(systemPrompt.includes("Покупательское намерение"));
  assert.ok(systemPrompt.includes("Do NOT duplicate the same phrase across groups"));
  assert.ok(systemPrompt.includes("посоветуйте разработчика"));
});

test("ai setup prompt asks for summary and diverse chat topics", () => {
  const { systemPrompt } = buildLeadRadarAiSetupPrompt({
    description: "Делаю сайты для малого бизнеса."
  });

  assert.ok(systemPrompt.includes("SUMMARY"));
  assert.ok(systemPrompt.includes("potential BUYERS gather"));
  assert.ok(systemPrompt.includes("Предприниматели"));
});
