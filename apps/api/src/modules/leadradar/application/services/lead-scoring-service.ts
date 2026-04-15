import type { LeadRadarMessageInput } from "../../types/ingestion.js";
import { normalizeLeadRadarText } from "../../lib/text-normalization.js";

const INTENT_PHRASES = ["нужен", "ищу", "кто сделает", "посоветуйте"] as const;
const SERVICE_PHRASES = ["бот", "сайт", "mvp", "автоматизация", "ai", "ии"] as const;

export class LeadScoringService {
  constructor() {}

  async score(input: {
    message: LeadRadarMessageInput;
    matchedKeywords: string[];
    categories: string[];
  }): Promise<{ score: number; breakdown: Record<string, number> }> {
    const text = normalizeLeadRadarText(input.message.text ?? "").normalized_text;

    const breakdown: Record<string, number> = {
      intent: 0,
      service: 0,
      length: 0,
      too_short: 0
    };

    // +3 intent
    if (INTENT_PHRASES.some((p) => text.includes(p))) {
      breakdown.intent = 3;
    }

    // +2 service
    if (SERVICE_PHRASES.some((p) => text.includes(p))) {
      breakdown.service = 2;
    }

    // +1 length
    if (text.length > 20) {
      breakdown.length = 1;
    }

    // -2 too short
    if (text.length > 0 && text.length < 5) {
      breakdown.too_short = -2;
    }

    const score = Object.values(breakdown).reduce((a, b) => a + b, 0);
    return { score, breakdown: { ...breakdown, total: score } };
  }
}

