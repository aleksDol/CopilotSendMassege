import test from "node:test";
import assert from "node:assert/strict";
import {
  buildLeadRadarOutreachAnalysisPrompt,
  buildLeadRadarOutreachMessagePrompt
} from "./leadradar-outreach-prompts.js";

const knowledgeItems = [
  { kind: "PRODUCT", title: "P1", content: "We help qualify inbound leads faster." }
] as const;

const replyPolicy = {
  toneRules: null,
  pricingRules: null,
  forbiddenPromises: null,
  forbiddenTopics: null
};

test("outreach analysis prompt keeps JSON contract", () => {
  const { systemPrompt, userPrompt } = buildLeadRadarOutreachAnalysisPrompt({
    leadMessage: "Need help with lead flow",
    leadName: "Alex",
    sourceType: "direct",
    chatTitle: "Личка",
    knowledgeItems: [...knowledgeItems],
    replyPolicy
  });

  assert.ok(systemPrompt.includes("Return ONLY valid JSON."));
  assert.ok(userPrompt.includes("Return JSON with EXACT keys:"));
});

test("outreach message prompt enforces context-specific first-touch question", () => {
  const { systemPrompt, userPrompt } = buildLeadRadarOutreachMessagePrompt({
    leadMessage: "ищу подрядчика",
    leadName: "Alex",
    sourceType: "channel_comments",
    chatTitle: "Маркетинг чат",
    relatedPostId: "post-123",
    contextPreview: "Комментарий под постом про воронки.",
    coldFirstTouchPlaybook: null,
    analysis: {
      leadType: "buyer_direct",
      detectedRole: "—",
      detectedActivity: "—",
      detectedNeedOrPain: "—",
      relevantOfferAngle: "simple qualification",
      productFit: true,
      productFitReason: "relevant",
      contactReason: "chat context",
      bestQuestion: "Как сейчас обрабатываете заявки?",
      keyTopic: "воронки",
      confidence: "low"
    },
    knowledgeItems: [...knowledgeItems],
    replyPolicy
  });

  assert.ok(systemPrompt.includes("Do NOT sell anything in the first message."));
  assert.ok(userPrompt.includes("Prefer context-specific questions over generic business questions."));
  assert.ok(userPrompt.includes("Use context only to choose the topic of the question, not to reveal the source of the context."));
  assert.ok(userPrompt.includes("Turn context into a question."));
  assert.ok(userPrompt.includes("avoid generic questions like:"));
  assert.ok(userPrompt.includes("\"увидел\", \"заметил\""));
  assert.ok(userPrompt.includes("Prefer questions over claims."));
  assert.ok(userPrompt.includes('Bad: "Привет! Как ты сейчас привлекаешь клиентов — больше через сайт или рекомендации?"'));
  assert.ok(
    userPrompt.includes(
      'Good: "Привет! Подскажи, клиенты на инфографику сейчас больше приходят с рекомендаций или из Telegram/чатов?"'
    )
  );
  assert.ok(systemPrompt.includes("Output ONLY the message text."));
  assert.ok(userPrompt.includes("relatedPostId: \"post-123\""));
  assert.ok(userPrompt.includes("contextPreview: \"Комментарий под постом про воронки.\""));
});
