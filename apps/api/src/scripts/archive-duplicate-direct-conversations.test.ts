import test from "node:test";
import assert from "node:assert/strict";
import {
  buildArchivePlan,
  runArchiveDuplicateDirectConversations
} from "./archive-duplicate-direct-conversations.js";

type ConversationInput = {
  id: string;
  companyId?: string;
  channelAccountId?: string;
  externalConversationId: string;
  isArchived?: boolean;
  participants: Array<{
    id: string;
    externalParticipantId: string | null;
    username?: string | null;
    isSelf?: boolean;
  }>;
  leadId?: string | null;
  lastMessageAt?: Date | null;
  title?: string | null;
};

function conv(input: ConversationInput) {
  return {
    id: input.id,
    companyId: input.companyId ?? "company-1",
    channelAccountId: input.channelAccountId ?? "channel-1",
    externalConversationId: input.externalConversationId,
    conversationType: "DIRECT" as const,
    isArchived: input.isArchived ?? false,
    lastMessageAt: input.lastMessageAt ?? null,
    leadId: input.leadId ?? null,
    title: input.title ?? null,
    participants: input.participants.map((p) => ({
      id: p.id,
      externalParticipantId: p.externalParticipantId,
      username: p.username ?? null,
      isSelf: p.isSelf ?? false
    }))
  };
}

test("username duplicate + numeric counterpart + shared safe non-self participant => eligible", () => {
  const plan = buildArchivePlan({
    conversations: [
      conv({
        id: "conv_username",
        externalConversationId: "Yan_adver",
        participants: [{ id: "p1", externalParticipantId: "6516814090", username: "Yan_adver" }],
        leadId: "lead_u"
      }),
      conv({
        id: "conv_numeric",
        externalConversationId: "6516814090",
        participants: [{ id: "p1", externalParticipantId: "6516814090", username: "Yan_adver" }],
        leadId: "lead_n"
      })
    ],
    ownerSelfIdsByChannel: new Map([["channel-1", new Set(["7753514676"])]])
  });

  assert.equal(plan.summary.eligibleForArchive, 1);
  assert.equal(plan.candidates[0].usernameConversationId, "conv_username");
  assert.equal(plan.candidates[0].numericConversationId, "conv_numeric");
  assert.ok(plan.candidates[0].reason.includes("proof_shared_non_self_participant"));
});

test("numeric conversation is never archived", () => {
  const plan = buildArchivePlan({
    conversations: [
      conv({
        id: "conv_numeric_only",
        externalConversationId: "6516814090",
        participants: [{ id: "p1", externalParticipantId: "6516814090" }]
      })
    ],
    ownerSelfIdsByChannel: new Map([["channel-1", new Set(["7753514676"])]])
  });

  assert.equal(plan.summary.eligibleForArchive, 0);
  assert.equal(plan.candidates.length, 0);
});

test("participant externalParticipantId equal to self account id => skippedSelfParticipant", () => {
  const plan = buildArchivePlan({
    conversations: [
      conv({
        id: "conv_username",
        externalConversationId: "Yan_adver",
        participants: [{ id: "p1", externalParticipantId: "7753514676", username: "Yan_adver" }]
      }),
      conv({
        id: "conv_numeric",
        externalConversationId: "7753514676",
        participants: [{ id: "p1", externalParticipantId: "7753514676", username: "Yan_adver" }]
      })
    ],
    ownerSelfIdsByChannel: new Map([["channel-1", new Set(["7753514676"])]])
  });

  assert.equal(plan.summary.eligibleForArchive, 0);
  assert.equal(plan.summary.skippedSelfParticipant, 1);
});

test("username-like conversation without numeric counterpart => skippedNoNumericCounterpart", () => {
  const plan = buildArchivePlan({
    conversations: [
      conv({
        id: "conv_username",
        externalConversationId: "Yan_adver",
        participants: [{ id: "p1", externalParticipantId: "6516814090", username: "Yan_adver" }]
      })
    ],
    ownerSelfIdsByChannel: new Map([["channel-1", new Set(["7753514676"])]])
  });

  assert.equal(plan.summary.eligibleForArchive, 0);
  assert.equal(plan.summary.skippedNoNumericCounterpart, 1);
});

test("title-only match is skipped (no safe participant proof)", () => {
  const plan = buildArchivePlan({
    conversations: [
      conv({
        id: "conv_username",
        externalConversationId: "Yan_adver",
        title: "Yan",
        participants: [{ id: "p_username_only", externalParticipantId: "6516814090", username: "Yan_adver" }]
      }),
      conv({
        id: "conv_numeric",
        externalConversationId: "6516814090",
        title: "Yan",
        participants: [{ id: "p_other", externalParticipantId: "6516814090", username: "Yan_adver" }]
      })
    ],
    ownerSelfIdsByChannel: new Map([["channel-1", new Set(["7753514676"])]])
  });

  assert.equal(plan.summary.eligibleForArchive, 0);
  assert.equal(plan.summary.skippedNoSafeParticipantProof, 1);
});

test("already archived username conversation => skippedAlreadyArchived", () => {
  const plan = buildArchivePlan({
    conversations: [
      conv({
        id: "conv_username_archived",
        externalConversationId: "Yan_adver",
        isArchived: true,
        participants: [{ id: "p1", externalParticipantId: "6516814090", username: "Yan_adver" }]
      }),
      conv({
        id: "conv_numeric",
        externalConversationId: "6516814090",
        participants: [{ id: "p1", externalParticipantId: "6516814090", username: "Yan_adver" }]
      })
    ],
    ownerSelfIdsByChannel: new Map([["channel-1", new Set(["7753514676"])]])
  });

  assert.equal(plan.summary.eligibleForArchive, 0);
  assert.equal(plan.summary.skippedAlreadyArchived, 1);
});

test("apply mode requires companyId", async () => {
  const prismaMock: any = {
    conversation: {
      findMany: async () => [],
      update: async () => ({})
    },
    telegramAccount: {
      findMany: async () => []
    }
  };

  await assert.rejects(
    () => runArchiveDuplicateDirectConversations(prismaMock, { apply: true }),
    /--apply requires explicit --company-id/
  );
});

test("dry-run does not mutate data", async () => {
  let updateCalls = 0;
  const prismaMock: any = {
    conversation: {
      findMany: async () => [
        {
          id: "conv_username",
          companyId: "company-1",
          channelAccountId: "channel-1",
          externalConversationId: "Yan_adver",
          conversationType: "DIRECT",
          isArchived: false,
          state: { lastMessageAt: null },
          lead: null,
          participants: [
            {
              participant: {
                id: "p1",
                externalParticipantId: "6516814090",
                username: "Yan_adver",
                isSelf: false
              }
            }
          ]
        },
        {
          id: "conv_numeric",
          companyId: "company-1",
          channelAccountId: "channel-1",
          externalConversationId: "6516814090",
          conversationType: "DIRECT",
          isArchived: false,
          state: { lastMessageAt: null },
          lead: null,
          participants: [
            {
              participant: {
                id: "p1",
                externalParticipantId: "6516814090",
                username: "Yan_adver",
                isSelf: false
              }
            }
          ]
        }
      ],
      update: async () => {
        updateCalls += 1;
        return {};
      }
    },
    telegramAccount: {
      findMany: async () => [{ channelAccountId: "channel-1", telegramUserId: "7753514676" }]
    }
  };

  const logger = { log: () => {}, error: () => {} };
  const result = await runArchiveDuplicateDirectConversations(
    prismaMock,
    { apply: false, companyId: "company-1" },
    logger
  );

  assert.equal(updateCalls, 0);
  assert.equal(result.archivedCount, 0);
  assert.equal(result.plan.summary.eligibleForArchive, 1);
});
