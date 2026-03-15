import type { PrismaClient } from "@prisma/client";

const defaultStatePayload = {
  unansweredClientMessageCount: 0,
  isWaitingForReply: false,
  leadStatus: "NEW" as const,
  leadStage: "NEW" as const,
  leadScore: 0,
  leadTemperature: "COLD" as const,
  summaryVersion: 0,
  stateVersion: 1
};

export class ConversationStateService {
  constructor(private readonly prisma: PrismaClient) {}

  async updateFromInboundMessage(params: {
    conversationId: string;
    messageId: string;
    sentAt: Date;
    preview: string | null;
  }) {
    const current = await this.prisma.conversationState.findUnique({
      where: { conversationId: params.conversationId },
      select: { unansweredClientMessageCount: true }
    });

    return this.prisma.conversationState.upsert({
      where: { conversationId: params.conversationId },
      create: {
        conversationId: params.conversationId,
        ...defaultStatePayload,
        lastMessageId: params.messageId,
        lastMessageAt: params.sentAt,
        lastMessagePreview: params.preview,
        lastInboundAt: params.sentAt,
        unansweredClientMessageCount: 1,
        isWaitingForReply: true
      },
      update: {
        lastMessageId: params.messageId,
        lastMessageAt: params.sentAt,
        lastMessagePreview: params.preview,
        lastInboundAt: params.sentAt,
        unansweredClientMessageCount: (current?.unansweredClientMessageCount ?? 0) + 1,
        isWaitingForReply: true,
        stateVersion: {
          increment: 1
        }
      }
    });
  }

  async updateFromOutboundMessage(params: {
    conversationId: string;
    messageId: string;
    sentAt: Date;
    preview: string | null;
  }) {
    return this.prisma.conversationState.upsert({
      where: { conversationId: params.conversationId },
      create: {
        conversationId: params.conversationId,
        ...defaultStatePayload,
        lastMessageId: params.messageId,
        lastMessageAt: params.sentAt,
        lastMessagePreview: params.preview,
        lastOutboundAt: params.sentAt,
        unansweredClientMessageCount: 0,
        isWaitingForReply: false
      },
      update: {
        lastMessageId: params.messageId,
        lastMessageAt: params.sentAt,
        lastMessagePreview: params.preview,
        lastOutboundAt: params.sentAt,
        unansweredClientMessageCount: 0,
        isWaitingForReply: false,
        stateVersion: {
          increment: 1
        }
      }
    });
  }
}
