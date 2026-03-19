import { KnowledgeKind, Prisma } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { AppError } from "../../lib/errors.js";

const toKnowledgeKind = (kind: string): KnowledgeKind => {
  switch (kind) {
    case "faq":
      return KnowledgeKind.FAQ;
    case "product":
    case "product_description":
      return KnowledgeKind.PRODUCT;
    case "policy":
    case "pricing_rules":
    case "tone_of_voice":
      return KnowledgeKind.POLICY;
    case "script":
    case "sales_script":
    case "objection_handling":
      return KnowledgeKind.SCRIPT;
    case "case":
    case "other":
      return KnowledgeKind.OTHER;
    default:
      return KnowledgeKind.OTHER;
  }
};

const fromKnowledgeKind = (kind: KnowledgeKind): string => {
  switch (kind) {
    case KnowledgeKind.FAQ:
      return "faq";
    case KnowledgeKind.PRODUCT:
      return "product_description";
    case KnowledgeKind.POLICY:
      return "pricing_rules";
    case KnowledgeKind.SCRIPT:
      return "sales_script";
    case KnowledgeKind.OTHER:
      return "case";
  }
};

const mapKnowledgeItem = (item: {
  id: string;
  kind: KnowledgeKind;
  title: string;
  content: string;
  isActive: boolean;
  priority: number;
  version: number;
}) => ({
  id: item.id,
  kind: fromKnowledgeKind(item.kind),
  title: item.title,
  content: item.content,
  isActive: item.isActive,
  priority: item.priority,
  version: item.version
});

export class SettingsService {
  constructor(private readonly app: FastifyInstance) {}

  async listKnowledge(companyId: string) {
    const rows = await this.app.prisma.knowledgeItem.findMany({
      where: { companyId },
      orderBy: [{ priority: "desc" }, { updatedAt: "desc" }, { id: "desc" }]
    });

    return {
      items: rows.map(mapKnowledgeItem)
    };
  }

  async createKnowledge(
    companyId: string,
    userId: string,
    payload: { kind: string; title: string; content: string; priority: number; isActive: boolean }
  ) {
    const item = await this.app.prisma.knowledgeItem.create({
      data: {
        companyId,
        createdByUserId: userId,
        kind: toKnowledgeKind(payload.kind),
        title: payload.title,
        content: payload.content,
        priority: payload.priority,
        isActive: payload.isActive
      }
    });

    return {
      item: mapKnowledgeItem(item)
    };
  }

  async patchKnowledge(
    companyId: string,
    id: string,
    payload: Partial<{ kind: string; title: string; content: string; priority: number; isActive: boolean }>
  ) {
    const existing = await this.app.prisma.knowledgeItem.findFirst({
      where: { id, companyId },
      select: { id: true }
    });

    if (!existing) {
      throw new AppError(404, "KNOWLEDGE_NOT_FOUND", "Knowledge item not found");
    }

    const item = await this.app.prisma.knowledgeItem.update({
      where: { id },
      data: {
        ...(payload.kind !== undefined ? { kind: toKnowledgeKind(payload.kind) } : {}),
        ...(payload.title !== undefined ? { title: payload.title } : {}),
        ...(payload.content !== undefined ? { content: payload.content } : {}),
        ...(payload.priority !== undefined ? { priority: payload.priority } : {}),
        ...(payload.isActive !== undefined ? { isActive: payload.isActive } : {}),
        version: {
          increment: 1
        }
      }
    });

    return {
      item: mapKnowledgeItem(item)
    };
  }

  async getReplyPolicy(companyId: string) {
    const policy = await this.app.prisma.replyPolicy.findUnique({
      where: { companyId }
    });

    return {
      policy
    };
  }

  async saveReplyPolicy(
    companyId: string,
    payload: {
      toneRules?: unknown;
      pricingRules?: unknown;
      discountRules?: unknown;
      forbiddenPromises?: unknown;
      forbiddenTopics?: unknown;
      humanHandoffRules?: unknown;
    }
  ) {
    const policy = await this.app.prisma.replyPolicy.upsert({
      where: { companyId },
      create: {
        companyId,
        toneRules: payload.toneRules as Prisma.InputJsonValue,
        pricingRules: payload.pricingRules as Prisma.InputJsonValue,
        discountRules: payload.discountRules as Prisma.InputJsonValue,
        forbiddenPromises: payload.forbiddenPromises as Prisma.InputJsonValue,
        forbiddenTopics: payload.forbiddenTopics as Prisma.InputJsonValue,
        humanHandoffRules: payload.humanHandoffRules as Prisma.InputJsonValue
      },
      update: {
        ...(payload.toneRules !== undefined ? { toneRules: payload.toneRules as Prisma.InputJsonValue } : {}),
        ...(payload.pricingRules !== undefined
          ? { pricingRules: payload.pricingRules as Prisma.InputJsonValue }
          : {}),
        ...(payload.discountRules !== undefined
          ? { discountRules: payload.discountRules as Prisma.InputJsonValue }
          : {}),
        ...(payload.forbiddenPromises !== undefined
          ? { forbiddenPromises: payload.forbiddenPromises as Prisma.InputJsonValue }
          : {}),
        ...(payload.forbiddenTopics !== undefined
          ? { forbiddenTopics: payload.forbiddenTopics as Prisma.InputJsonValue }
          : {}),
        ...(payload.humanHandoffRules !== undefined
          ? { humanHandoffRules: payload.humanHandoffRules as Prisma.InputJsonValue }
          : {})
      }
    });

    return {
      policy
    };
  }
}
