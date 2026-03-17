import type { AIMessage } from "@repo/ai-core";
import { ChannelAccountStatus } from "@prisma/client";
import type { Conversation, ConversationState, KnowledgeItem, ReplyPolicy } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { readThroughCache } from "../../lib/cache.js";
import { AppError } from "../../lib/errors.js";

export type AIContext = {
  conversation: Conversation;
  state: ConversationState | null;
  latestSummary: string | null;
  recentMessages: AIMessage[];
  triggerMessageId: string | null;
  lastMessageId: string | null;
  knowledgeItems: Array<Pick<KnowledgeItem, "id" | "kind" | "title" | "content" | "priority" | "version">>;
  knowledgeVersion: string;
  replyPolicy: ReplyPolicy | null;
  replyPolicyVersion: string;
};

const toAIMessages = (messages: Array<{ direction: string; text: string | null }>): AIMessage[] =>
  messages
    .slice()
    .reverse()
    .map<AIMessage>((message) => ({
      role: (message.direction === "OUTBOUND" ? "assistant" : "user") as AIMessage["role"],
      content: message.text ?? ""
    }))
    .filter((message) => message.content.trim().length > 0);

export class AIContextService {
  constructor(private readonly app: FastifyInstance) {}

  async build(params: { companyId: string; conversationId: string }): Promise<AIContext> {
    const conversation = await this.app.prisma.conversation.findFirst({
      where: {
        id: params.conversationId,
        companyId: params.companyId,
        channelAccount: { status: { not: ChannelAccountStatus.DISCONNECTED } }
      }
    });

    if (!conversation) {
      throw new AppError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }

    const [state, summary, messages, knowledgeItems, replyPolicy] = await Promise.all([
      this.app.prisma.conversationState.findUnique({ where: { conversationId: conversation.id } }),
      this.app.prisma.conversationSummary.findFirst({
        where: { conversationId: conversation.id },
        orderBy: { createdAt: "desc" },
        select: { summaryText: true }
      }),
      this.app.prisma.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: [{ sentAt: "desc" }, { id: "desc" }],
        take: this.app.config.env.AI_MAX_CONTEXT_MESSAGES,
        select: {
          id: true,
          direction: true,
          text: true
        }
      }),
      readThroughCache(this.app, {
        keyParts: ["cache:knowledge", params.companyId],
        loader: () =>
          this.app.prisma.knowledgeItem.findMany({
            where: {
              companyId: params.companyId,
              isActive: true
            },
            orderBy: [{ priority: "desc" }, { updatedAt: "desc" }],
            take: 20,
            select: {
              id: true,
              kind: true,
              title: true,
              content: true,
              priority: true,
              version: true
            }
          })
      }),
      readThroughCache(this.app, {
        keyParts: ["cache:reply-policy", params.companyId],
        loader: () => this.app.prisma.replyPolicy.findUnique({ where: { companyId: params.companyId } })
      })
    ]);

    const lastMessageId = messages[0]?.id ?? null;
    const knowledgeVersion = knowledgeItems.map((item) => `${item.id}:${item.version}`).join("|") || "none";
    const replyPolicyVersion = replyPolicy ? replyPolicy.updatedAt.toISOString() : "none";

    return {
      conversation,
      state,
      latestSummary: summary?.summaryText ?? null,
      recentMessages: toAIMessages(messages.map((message) => ({ direction: message.direction, text: message.text }))),
      triggerMessageId: messages.find((message) => message.direction === "INBOUND")?.id ?? messages[0]?.id ?? null,
      lastMessageId,
      knowledgeItems,
      knowledgeVersion,
      replyPolicy,
      replyPolicyVersion
    };
  }
}
