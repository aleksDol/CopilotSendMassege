import test from "node:test";
import assert from "node:assert/strict";
import { pickCanonicalConversation } from "./merge-direct-conversation-duplicates.js";

test("pickCanonicalConversation prefers numeric externalConversationId equal to peer externalParticipantId", () => {
  const res = pickCanonicalConversation({
    peerExternalParticipantId: "12345",
    conversations: [
      { id: "a", externalConversationId: "some_username", updatedAt: new Date("2026-01-03"), title: null },
      { id: "b", externalConversationId: "12345", updatedAt: new Date("2026-01-01"), title: null }
    ]
  });

  assert.equal(res.canonicalId, "b");
  assert.deepEqual(res.mergedIds, ["a"]);
});

test("pickCanonicalConversation falls back to most recently updated conversation when no numeric canonical exists", () => {
  const res = pickCanonicalConversation({
    peerExternalParticipantId: "12345",
    conversations: [
      { id: "a", externalConversationId: "old_username", updatedAt: new Date("2026-01-01"), title: null },
      { id: "b", externalConversationId: "new_username", updatedAt: new Date("2026-01-05"), title: null }
    ]
  });

  assert.equal(res.canonicalId, "b");
  assert.deepEqual(res.mergedIds, ["a"]);
});

