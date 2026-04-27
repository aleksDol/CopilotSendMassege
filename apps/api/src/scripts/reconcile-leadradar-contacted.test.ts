import test from "node:test";
import assert from "node:assert/strict";
import { canCreateCrmLeadFromMatchedConversation } from "./reconcile-leadradar-contacted.js";

test("reconciliation allows creation only for DIRECT + has messages", () => {
  assert.equal(canCreateCrmLeadFromMatchedConversation({ conversationType: "DIRECT", hasAnyMessages: true }), true);
  assert.equal(canCreateCrmLeadFromMatchedConversation({ conversationType: "DIRECT", hasAnyMessages: false }), false);
  assert.equal(canCreateCrmLeadFromMatchedConversation({ conversationType: "GROUP", hasAnyMessages: true }), false);
  assert.equal(canCreateCrmLeadFromMatchedConversation({ conversationType: "CHANNEL", hasAnyMessages: true }), false);
});

