import type { LeadKeywordRepository } from "../../infrastructure/repositories/lead-keyword-repository.js";
import type { LeadRadarMessageInput } from "../../types/ingestion.js";
import { normalizeLeadRadarText } from "../../lib/text-normalization.js";

export type LeadRadarMatchOutput =
  | {
      matched: false;
      reason: "negative_keyword" | "no_positive_match";
      matchedKeywords: string[];
      categories: string[];
      debug?: {
        normalized_text: string;
        negative_keyword_matches: string[];
        positive_keyword_matches: string[];
        positive_keyword_matches_detailed: Array<{ keyword: string; match_type: string; matched_against: "normalized_text" | "raw_text" }>;
      };
    }
  | { matched: true; matchedKeywords: string[]; categories: string[] };

export class LeadMatchService {
  constructor(private readonly deps: { keywordRepo: LeadKeywordRepository }) {}

  async match(input: LeadRadarMessageInput): Promise<LeadRadarMatchOutput> {
    const { raw_text, normalized_text } = normalizeLeadRadarText(input.text ?? "");

    const [positive, negative] = await Promise.all([
      this.deps.keywordRepo.listKeywords({ user_id: input.userId, telegram_account_id: input.telegramAccountId }),
      this.deps.keywordRepo.listNegativeKeywords({ user_id: input.userId, telegram_account_id: input.telegramAccountId })
    ]);

    const negativeActive = negative.filter((k) => k.is_active);
    const negative_keyword_matches: string[] = [];
    for (const nk of negativeActive) {
      const phrase = (nk.phrase ?? "").trim();
      if (!phrase) continue;
      const phraseNorm = normalizeLeadRadarText(phrase).normalized_text;
      if (phraseNorm && normalized_text.includes(phraseNorm)) {
        negative_keyword_matches.push(phrase);
      }
    }
    if (negative_keyword_matches.length > 0) {
      return {
        matched: false,
        reason: "negative_keyword",
        matchedKeywords: [],
        categories: [],
        debug: {
          normalized_text,
          negative_keyword_matches,
          positive_keyword_matches: [],
          positive_keyword_matches_detailed: []
        }
      };
    }

    const matchedKeywords: string[] = [];
    const categories = new Set<string>();
    const positive_keyword_matches_detailed: Array<{
      keyword: string;
      match_type: string;
      matched_against: "normalized_text" | "raw_text";
    }> = [];

    const positiveActive = positive.filter((k) => k.is_active);
    for (const kw of positiveActive) {
      const rule = (kw.keyword ?? "").trim();
      if (!rule) continue;
      const ruleNorm = normalizeLeadRadarText(rule).normalized_text;

      let ok = false;
      if (kw.match_type === "contains") {
        ok = Boolean(ruleNorm) && normalized_text.includes(ruleNorm);
      } else if (kw.match_type === "exact") {
        ok = Boolean(ruleNorm) && normalized_text === ruleNorm;
      } else if (kw.match_type === "regex") {
        try {
          ok = new RegExp(rule, "i").test(raw_text);
        } catch {
          ok = false;
        }
      }

      if (ok) {
        matchedKeywords.push(rule);
        categories.add(String(kw.category));
        positive_keyword_matches_detailed.push({
          keyword: rule,
          match_type: String(kw.match_type),
          matched_against: kw.match_type === "regex" ? "raw_text" : "normalized_text"
        });
      }
    }

    if (matchedKeywords.length === 0) {
      return {
        matched: false,
        reason: "no_positive_match",
        matchedKeywords: [],
        categories: [],
        debug: {
          normalized_text,
          negative_keyword_matches: [],
          positive_keyword_matches: [],
          positive_keyword_matches_detailed
        }
      };
    }

    return { matched: true, matchedKeywords, categories: [...categories] };
  }
}

