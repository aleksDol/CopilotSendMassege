import type { PrismaClient } from "@prisma/client";

export type MarketplaceRecommendationItem = {
  id: string;
  name: string;
  description: string | null;
  icon: string;
  color: string;
  sourceCount: number;
  recommended: boolean;
};

const normalizeForMatch = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s-]/gu, "");

const slugifyForMatch = (value: string): string =>
  normalizeForMatch(value)
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

export const topicMatchesChatTopic = (
  topic: { name: string; slug: string; description: string | null },
  chatTopic: string
): boolean => {
  const chat = normalizeForMatch(chatTopic);
  if (!chat) return false;

  const name = normalizeForMatch(topic.name);
  const slug = topic.slug.trim().toLowerCase();
  const description = normalizeForMatch(topic.description ?? "");
  const chatSlug = slugifyForMatch(chatTopic);

  if (name && (name === chat || name.includes(chat) || chat.includes(name))) {
    return true;
  }

  if (description && (description.includes(chat) || chat.includes(description))) {
    return true;
  }

  if (chatSlug && slug && (slug === chatSlug || slug.includes(chatSlug) || chatSlug.includes(slug))) {
    return true;
  }

  return false;
};

export const resolveRecommendedTopicIds = (
  topics: Array<{ id: string; name: string; slug: string; description: string | null }>,
  chatTopics: string[]
): Set<string> => {
  const recommended = new Set<string>();
  const normalizedChatTopics = chatTopics.map((t) => t.trim()).filter(Boolean);
  if (!normalizedChatTopics.length) {
    return recommended;
  }

  for (const topic of topics) {
    if (normalizedChatTopics.some((chatTopic) => topicMatchesChatTopic(topic, chatTopic))) {
      recommended.add(topic.id);
    }
  }

  return recommended;
};

export async function getMarketplaceRecommendations(
  prisma: PrismaClient,
  chatTopics: string[]
): Promise<{ items: MarketplaceRecommendationItem[]; total: number; hasRecommendations: boolean }> {
  const rows = await prisma.sourceMarketplaceTopic.findMany({
    where: { status: "active" },
    include: {
      entries: {
        where: { entry: { status: "active" } },
        select: { entryId: true }
      }
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }]
  });

  const recommendedIds = resolveRecommendedTopicIds(rows, chatTopics);
  const hasRecommendations = recommendedIds.size > 0;

  const items: MarketplaceRecommendationItem[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    icon: row.icon,
    color: row.color,
    sourceCount: row.entries.length,
    recommended: hasRecommendations ? recommendedIds.has(row.id) : false
  }));

  return { items, total: items.length, hasRecommendations };
}
