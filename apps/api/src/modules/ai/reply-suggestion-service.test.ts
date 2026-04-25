import test from "node:test";
import assert from "node:assert/strict";
import { __test__ } from "./reply-suggestion-service.js";

test("selectCopilotContextMessages keeps latest client message and filters empty", () => {
  const messages = [
    { role: "user" as const, content: " " },
    { role: "assistant" as const, content: "A1" },
    { role: "user" as const, content: "U1" },
    { role: "assistant" as const, content: "" },
    { role: "assistant" as const, content: "A2" },
    { role: "user" as const, content: "U-last" }
  ];

  const selected = __test__.selectCopilotContextMessages(messages, 3);
  assert.equal(selected.some((m) => m.content.trim().length === 0), false);
  assert.equal(selected[selected.length - 1]?.content, "U-last");
});

