import test from "node:test";
import assert from "node:assert/strict";
import { LeadStage } from "@prisma/client";
import { syncLeadStageToConversationState } from "./lead-stage-sync.js";

test("LeadStage enum includes REPLIED and IGNORED", () => {
  assert.equal(LeadStage.REPLIED, "REPLIED");
  assert.equal(LeadStage.IGNORED, "IGNORED");
});

test("syncLeadStageToConversationState upserts and updates only leadStage", async () => {
  let receivedArgs: any = null;

  const prisma = {
    conversationState: {
      upsert: async (args: any) => {
        receivedArgs = args;
        return { ok: true };
      }
    }
  } as any;

  await syncLeadStageToConversationState(prisma, {
    conversationId: "conv-1",
    stage: LeadStage.REPLIED
  });

  assert.ok(receivedArgs, "expected prisma.conversationState.upsert to be called");
  assert.deepEqual(receivedArgs.where, { conversationId: "conv-1" });
  assert.deepEqual(receivedArgs.create, { conversationId: "conv-1", leadStage: "REPLIED" });
  assert.deepEqual(receivedArgs.update, { leadStage: "REPLIED" });

  // Safety: ensure we didn't accidentally write other state fields.
  assert.deepEqual(Object.keys(receivedArgs.update).sort(), ["leadStage"]);
  assert.deepEqual(Object.keys(receivedArgs.create).sort(), ["conversationId", "leadStage"]);
});

