export type LeadRadarTextNormalization = {
  raw_text: string;
  normalized_text: string;
};

/**
 * LeadRadar matching normalization.
 * Goal: stable matching for "exact"/"contains" across punctuation, extra spaces, and common Cyrillic variants.
 *
 * Notes:
 * - We keep only letters/numbers and spaces.
 * - Regex rules are still evaluated against raw text (see match service).
 */
export const normalizeLeadRadarText = (raw: string | null | undefined): LeadRadarTextNormalization => {
  const raw_text = String(raw ?? "");
  const normalized_text = raw_text
    .toLowerCase()
    .replaceAll("ё", "е")
    // Replace any non-letter/digit runs with a single space (unicode-aware)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  return { raw_text, normalized_text };
};

