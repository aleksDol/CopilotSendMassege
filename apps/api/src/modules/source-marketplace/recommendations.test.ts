import assert from "node:assert/strict";
import test from "node:test";
import { resolveRecommendedTopicIds, topicMatchesChatTopic } from "./recommendations.js";

test("topicMatchesChatTopic matches by name overlap", () => {
  assert.equal(
    topicMatchesChatTopic({ name: "Маркетинг", slug: "marketing", description: null }, "Маркетинг"),
    true
  );
  assert.equal(
    topicMatchesChatTopic({ name: "Малый бизнес", slug: "small-business", description: null }, "бизнес"),
    true
  );
});

test("topicMatchesChatTopic matches by slug", () => {
  assert.equal(
    topicMatchesChatTopic(
      { name: "Недвижимость", slug: "real-estate", description: "Чаты про недвижимость" },
      "real-estate"
    ),
    true
  );
});

test("resolveRecommendedTopicIds returns empty when chatTopics empty", () => {
  const ids = resolveRecommendedTopicIds(
    [{ id: "1", name: "Маркетинг", slug: "marketing", description: null }],
    []
  );
  assert.equal(ids.size, 0);
});

test("resolveRecommendedTopicIds marks matching topics", () => {
  const ids = resolveRecommendedTopicIds(
    [
      { id: "1", name: "Маркетинг", slug: "marketing", description: null },
      { id: "2", name: "Строительство", slug: "construction", description: null }
    ],
    ["Маркетинг", "Стартапы"]
  );
  assert.deepEqual([...ids], ["1"]);
});
