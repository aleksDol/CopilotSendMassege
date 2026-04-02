import type { LeadRadarMessageInput } from "../../types/ingestion.js";

const INTENT_PHRASES = ["нужен", "ищу", "кто сделает", "посоветуйте"] as const;
const SERVICE_PHRASES = ["бот", "сайт", "mvp", "автоматизация", "ai", "ии"] as const;

export class LeadScoringService {
  constructor() {}

  async score(input: { message: LeadRadarMessageInput; matchedKeywords: string[]; categories: string[] }): Promise<number> {
    const text = (input.message.text ?? "").trim().toLowerCase();

    let score = 0;

    // +3 intent
    if (INTENT_PHRASES.some((p) => text.includes(p))) {
      score += 3;
    }

    // +2 service
    if (SERVICE_PHRASES.some((p) => text.includes(p))) {
      score += 2;
    }

    // +1 length
    if (text.length > 20) {
      score += 1;
    }

    // -2 too short
    if (text.length > 0 && text.length < 5) {
      score -= 2;
    }

    return score;
  }
}

