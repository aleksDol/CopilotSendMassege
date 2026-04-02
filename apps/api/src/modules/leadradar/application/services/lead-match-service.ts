import type { LeadKeywordRepository } from "../../infrastructure/repositories/lead-keyword-repository.js";
import type { LeadRadarMessageInput } from "../../types/ingestion.js";

export type LeadRadarMatchOutput =
  | { matched: false; reason: "negative_keyword" | "no_positive_match"; matchedKeywords: string[]; categories: string[] }
  | { matched: true; matchedKeywords: string[]; categories: string[] };

const safeLower = (v: string) => v.toLowerCase();

export class LeadMatchService {
  constructor(private readonly deps: { keywordRepo: LeadKeywordRepository }) {}

  async match(input: LeadRadarMessageInput): Promise<LeadRadarMatchOutput> {
    const text = safeLower(input.text ?? "");

    const [positive, negative] = await Promise.all([
      this.deps.keywordRepo.listKeywords({ user_id: input.userId, telegram_account_id: input.telegramAccountId }),
      this.deps.keywordRepo.listNegativeKeywords({ user_id: input.userId, telegram_account_id: input.telegramAccountId })
    ]);

    const negativeActive = negative.filter((k) => k.is_active);
    for (const nk of negativeActive) {
      const phrase = (nk.phrase ?? "").trim();
      if (!phrase) continue;
      if (text.includes(safeLower(phrase))) {
        return { matched: false, reason: "negative_keyword", matchedKeywords: [], categories: [] };
      }
    }

    const matchedKeywords: string[] = [];
    const categories = new Set<string>();

    const positiveActive = positive.filter((k) => k.is_active);
    for (const kw of positiveActive) {
      const rule = (kw.keyword ?? "").trim();
      if (!rule) continue;
      const ruleNorm = safeLower(rule);

      let ok = false;
      if (kw.match_type === "contains") {
        ok = text.includes(ruleNorm);
      } else if (kw.match_type === "exact") {
        ok = text === ruleNorm;
      } else if (kw.match_type === "regex") {
        try {
          ok = new RegExp(rule, "i").test(input.text);
        } catch {
          ok = false;
        }
      }

      if (ok) {
        matchedKeywords.push(rule);
        categories.add(String(kw.category));
      }
    }

    if (matchedKeywords.length === 0) {
      return { matched: false, reason: "no_positive_match", matchedKeywords: [], categories: [] };
    }

    return { matched: true, matchedKeywords, categories: [...categories] };
  }
}

