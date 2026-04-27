import test from "node:test";
import assert from "node:assert/strict";
import { ensureCrmLeadForOutbound } from "./crm-lead-stage-automation.js";

test("outbound lead creation requires peerExternalId (null is skipped) — ingestion must provide fallback", async () => {
  const prisma = {
    lead: {
      findUnique: async () => null,
      create: async () => {
        throw new Error("should not create without peerExternalId");
      }
    }
  } as any;

  const lead = await ensureCrmLeadForOutbound(prisma, {
    companyId: "co1",
    conversationId: "conv1",
    conversationType: "DIRECT",
    peerExternalId: null,
    peerIsBot: false,
    isServiceDialog: false,
    senderExternalId: "self1"
  });

  assert.equal(lead, null);
});

