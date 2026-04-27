import test from "node:test";
import assert from "node:assert/strict";
import { isInvalidCrmLeadConversationType, INVALID_CONVERSATION_TYPES } from "./cleanup-invalid-crm-leads.js";

test("invalid CRM lead cleanup targets only GROUP and CHANNEL", () => {
  assert.deepEqual(INVALID_CONVERSATION_TYPES, ["GROUP", "CHANNEL"]);
  assert.equal(isInvalidCrmLeadConversationType("GROUP" as any), true);
  assert.equal(isInvalidCrmLeadConversationType("CHANNEL" as any), true);
  assert.equal(isInvalidCrmLeadConversationType("DIRECT" as any), false);
});

