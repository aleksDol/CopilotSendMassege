import test from "node:test";
import assert from "node:assert/strict";
import { resolveConversationForMessage } from "./conversation-identity.js";

function makePrisma(overrides: Partial<any> = {}) {
  return {
    participant: {
      findUnique: async () => null,
      ...(overrides.participant ?? {})
    },
    conversationParticipant: {
      findFirst: async () => null,
      ...(overrides.conversationParticipant ?? {})
    },
    conversation: {
      upsert: async () => ({ id: "conv_upsert", externalConversationId: "x" }),
      update: async () => ({}),
      findUniqueOrThrow: async () => ({ id: "conv_existing", externalConversationId: "peer123" }),
      ...(overrides.conversation ?? {})
    }
  } as any;
}

test("DIRECT: resolves existing conversation by peerExternalParticipantId, prefers exact externalConversationId match", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    participant: {
      findUnique: async () => ({ id: "p1" })
    },
    conversationParticipant: {
      findFirst: async (args: any) => {
        calls.push(["conversationParticipant.findFirst", args]);
        // return exact match on first attempt
        if (args?.where?.conversation?.externalConversationId === "peer123") {
          return { conversation: { id: "conv_exact", externalConversationId: "peer123" } };
        }
        return null;
      }
    },
    conversation: {
      upsert: async () => {
        throw new Error("should not upsert when existing conversation found");
      },
      update: async (args: any) => {
        calls.push(["conversation.update", args]);
        return {};
      },
      findUniqueOrThrow: async (args: any) => {
        calls.push(["conversation.findUniqueOrThrow", args]);
        return { id: args.where.id, externalConversationId: "peer123" };
      }
    }
  });

  const res = await resolveConversationForMessage(prisma, {
    companyId: "co1",
    channelAccountId: "ca1",
    externalConversationId: "Yan_adver",
    conversationType: "DIRECT",
    conversationTitle: "Yan",
    peerExternalParticipantId: "peer123"
  });

  assert.equal(res.id, "conv_exact");
  assert.equal(calls.some((c) => c[0] === "conversation.update"), true);
});

test("DIRECT: does not fallback to any conversation for peer when exact match missing", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    participant: {
      findUnique: async () => ({ id: "p1" })
    },
    conversationParticipant: {
      findFirst: async (args: any) => {
        calls.push(["conversationParticipant.findFirst", args]);
        // exact DIRECT by peer id is not found
        return null;
      }
    },
    conversation: {
      upsert: async (args: any) => {
        calls.push(["conversation.upsert", args]);
        return { id: "conv_upserted", externalConversationId: args.create.externalConversationId };
      },
      findUniqueOrThrow: async (args: any) => ({ id: args.where.id, externalConversationId: "some" })
    }
  });

  const res = await resolveConversationForMessage(prisma, {
    companyId: "co1",
    channelAccountId: "ca1",
    externalConversationId: "username_chat",
    conversationType: "DIRECT",
    peerExternalParticipantId: "peer123"
  });

  assert.equal(res.id, "conv_upserted");
  assert.equal(calls.some((c) => c[0] === "conversation.upsert"), true);
  const upsertCall = calls.find((c) => c[0] === "conversation.upsert")?.[1];
  assert.equal(upsertCall?.where?.channelAccountId_externalConversationId?.channelAccountId, "ca1");
  assert.equal(upsertCall?.where?.channelAccountId_externalConversationId?.externalConversationId, "username_chat");
});

test("Non-DIRECT or missing peer id: falls back to upsert by externalConversationId", async () => {
  const calls: any[] = [];
  const prisma = makePrisma({
    conversation: {
      upsert: async (args: any) => {
        calls.push(args);
        return { id: "conv_upserted", externalConversationId: args.create.externalConversationId };
      }
    }
  });

  const res = await resolveConversationForMessage(prisma, {
    companyId: "co1",
    channelAccountId: "ca1",
    externalConversationId: "group1",
    conversationType: "GROUP",
    conversationTitle: "Group"
  });

  assert.equal(res.id, "conv_upserted");
  assert.equal(calls.length, 1);
});
