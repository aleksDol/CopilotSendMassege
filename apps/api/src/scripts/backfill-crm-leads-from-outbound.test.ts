import test from "node:test";
import assert from "node:assert/strict";
import { isEligibleForOutboundBackfill } from "./backfill-crm-leads-from-outbound.js";

test("backfill eligibility: DIRECT + OUTBOUND + no Lead => eligible", () => {
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "DIRECT" as any,
      hasOutboundMessages: true,
      hasExistingLead: false,
      externalConversationId: "Yan_adver",
      channelAccountId: "ca1"
    }),
    true
  );
});

test("backfill eligibility: DIRECT + no OUTBOUND => skipped", () => {
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "DIRECT" as any,
      hasOutboundMessages: false,
      hasExistingLead: false,
      externalConversationId: "Yan_adver",
      channelAccountId: "ca1"
    }),
    false
  );
});

test("backfill eligibility: GROUP/CHANNEL => skipped", () => {
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "GROUP" as any,
      hasOutboundMessages: true,
      hasExistingLead: false,
      externalConversationId: "x",
      channelAccountId: "ca1"
    }),
    false
  );
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "CHANNEL" as any,
      hasOutboundMessages: true,
      hasExistingLead: false,
      externalConversationId: "x",
      channelAccountId: "ca1"
    }),
    false
  );
});

test("backfill eligibility: existing Lead => skipped", () => {
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "DIRECT" as any,
      hasOutboundMessages: true,
      hasExistingLead: true,
      externalConversationId: "x",
      channelAccountId: "ca1"
    }),
    false
  );
});

test("backfill eligibility: missing externalConversationId/channelAccountId => skipped", () => {
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "DIRECT" as any,
      hasOutboundMessages: true,
      hasExistingLead: false,
      externalConversationId: null,
      channelAccountId: "ca1"
    }),
    false
  );
  assert.equal(
    isEligibleForOutboundBackfill({
      conversationType: "DIRECT" as any,
      hasOutboundMessages: true,
      hasExistingLead: false,
      externalConversationId: "x",
      channelAccountId: null
    }),
    false
  );
});

