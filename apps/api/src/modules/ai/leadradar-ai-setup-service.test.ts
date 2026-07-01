import test from "node:test";
import assert from "node:assert/strict";
import { normalizeLeadRadarAiSetupResult } from "./leadradar-ai-setup-service.js";
import { aiSetupGenerateBodySchema } from "../leadradar/api/schemas.js";
import { LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES } from "./leadradar-ai-setup-prompts.js";

test("aiSetupGenerateBodySchema trims description", () => {
  const out = aiSetupGenerateBodySchema.parse({ description: "  Делаю сайты  " });
  assert.equal(out.description, "Делаю сайты");
});

test("normalizeLeadRadarAiSetupResult builds canonical groups and dedupes globally", () => {
  const out = normalizeLeadRadarAiSetupResult({
    niche: "  Разработка сайтов  ",
    summary: "  Ищем тех, кто ищет подрядчика на сайт.  ",
    keywordGroups: [
      {
        title: "Поиск исполнителя",
        description: "Люди ищут, кого нанять",
        keywords: ["посоветуйте разработчика", "ищу подрядчика"]
      },
      {
        title: "Прямые запросы",
        description: "Прямой запрос услуги",
        keywords: ["посоветуйте разработчика", "нужен лендинг"]
      }
    ],
    negativeKeywords: ["ищу работу", ""],
    chatTopics: ["Малый бизнес", "Маркетинг", "Маркетинг"]
  });

  assert.equal(out.niche, "Разработка сайтов");
  assert.equal(out.summary, "Ищем тех, кто ищет подрядчика на сайт.");
  assert.equal(out.keywordGroups.length, LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.length);
  assert.deepEqual(out.keywordGroups[0]?.keywords, ["посоветуйте разработчика", "ищу подрядчика"]);
  assert.deepEqual(out.keywordGroups[4]?.keywords, ["нужен лендинг"]);
  assert.deepEqual(out.negativeKeywords, ["ищу работу"]);
  assert.deepEqual(out.chatTopics, ["Малый бизнес", "Маркетинг"]);
});

test("normalizeLeadRadarAiSetupResult rejects when all groups are empty", () => {
  assert.throws(() =>
    normalizeLeadRadarAiSetupResult({
      niche: "Test",
      summary: "Summary",
      keywordGroups: LEADRADAR_AI_SETUP_KEYWORD_GROUP_TITLES.map((title) => ({
        title,
        description: "Desc",
        keywords: []
      })),
      negativeKeywords: [],
      chatTopics: ["Topic"]
    })
  );
});
