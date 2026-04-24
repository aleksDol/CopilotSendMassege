import type { LeadKeywordRepository } from "../../infrastructure/repositories/lead-keyword-repository.js";
import { LeadKeywordTarget } from "../../domain/enums/lead-keyword-target.js";
import { LeadMatchType } from "../../domain/enums/lead-match-type.js";

const MIN_AUTHOR_PROFILE_KEYWORD_LENGTH = 2;
const VALUE_PREVIEW_MAX_LENGTH = 120;
const REASON_MAX_LENGTH = 220;

type AuthorProfileField =
  | "username"
  | "displayName"
  | "bio"
  | "linkedChannelUsername"
  | "linkedChannelTitle"
  | "linkedChannelDescription";

type AuthorProfileFieldEntry = {
  field: AuthorProfileField;
  value: string;
  isUsernameField: boolean;
};

export type LeadRadarAuthorProfileMatchInput = {
  userId: string;
  telegramAccountId: string;
  telegramUserId: string;
  username?: string | null;
  displayName?: string | null;
  bio?: string | null;
  linkedChannelUsername?: string | null;
  linkedChannelTitle?: string | null;
  linkedChannelDescription?: string | null;
  rawProfileJson?: unknown | null;
};

export type LeadRadarAuthorProfileMatchResult = {
  matched: boolean;
  score: number;
  matchedKeywords: Array<{
    keywordId: string;
    keyword: string;
    matchType: "contains" | "exact" | "regex";
    target: "author_profile";
    field: AuthorProfileField;
    valuePreview: string;
    score: number;
  }>;
  reason: string;
};

const trimOrNull = (value: string | null | undefined): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const normalizeUsername = (value: string): string => normalizeText(value).replace(/^@+/u, "");

const shorten = (value: string, maxLen: number): string => {
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3)).trimEnd()}...`;
};

const fieldReasonLabel = (field: AuthorProfileField): string => {
  if (field === "username") return "username";
  if (field === "displayName") return "имени";
  if (field === "bio") return "описании";
  if (field === "linkedChannelUsername") return "username канала";
  if (field === "linkedChannelTitle") return "названии канала";
  return "описании канала";
};

const buildProfileFields = (input: LeadRadarAuthorProfileMatchInput): AuthorProfileFieldEntry[] => {
  const maybe: Array<AuthorProfileFieldEntry | null> = [
    (() => {
      const value = trimOrNull(input.username);
      return value ? { field: "username", value, isUsernameField: true } : null;
    })(),
    (() => {
      const value = trimOrNull(input.displayName);
      return value ? { field: "displayName", value, isUsernameField: false } : null;
    })(),
    (() => {
      const value = trimOrNull(input.bio);
      return value ? { field: "bio", value, isUsernameField: false } : null;
    })(),
    (() => {
      const value = trimOrNull(input.linkedChannelUsername);
      return value ? { field: "linkedChannelUsername", value, isUsernameField: true } : null;
    })(),
    (() => {
      const value = trimOrNull(input.linkedChannelTitle);
      return value ? { field: "linkedChannelTitle", value, isUsernameField: false } : null;
    })(),
    (() => {
      const value = trimOrNull(input.linkedChannelDescription);
      return value ? { field: "linkedChannelDescription", value, isUsernameField: false } : null;
    })()
  ];

  return maybe.filter((x): x is AuthorProfileFieldEntry => Boolean(x));
};

const matchesContains = (rule: string, field: AuthorProfileFieldEntry): boolean => {
  const ruleNorm = field.isUsernameField ? normalizeUsername(rule) : normalizeText(rule);
  if (!ruleNorm) return false;
  const valueNorm = field.isUsernameField ? normalizeUsername(field.value) : normalizeText(field.value);
  return valueNorm.includes(ruleNorm);
};

const matchesExact = (rule: string, field: AuthorProfileFieldEntry): boolean => {
  const ruleNorm = field.isUsernameField ? normalizeUsername(rule) : normalizeText(rule);
  if (!ruleNorm) return false;
  const valueNorm = field.isUsernameField ? normalizeUsername(field.value) : normalizeText(field.value);
  return valueNorm === ruleNorm;
};

const matchesRegex = (rule: string, field: AuthorProfileFieldEntry): boolean => {
  try {
    const re = new RegExp(rule, "i");
    if (re.test(field.value)) return true;
    if (field.isUsernameField) return re.test(normalizeUsername(field.value));
    return false;
  } catch {
    return false;
  }
};

export class LeadRadarAuthorProfileMatchService {
  constructor(private readonly deps: { keywordRepo: LeadKeywordRepository }) {}

  async match(input: LeadRadarAuthorProfileMatchInput): Promise<LeadRadarAuthorProfileMatchResult> {
    const keywords = await this.deps.keywordRepo.listKeywords({
      user_id: input.userId,
      telegram_account_id: input.telegramAccountId
    });

    const fields = buildProfileFields(input);
    const matchedKeywords: LeadRadarAuthorProfileMatchResult["matchedKeywords"] = [];

    const authorProfileKeywords = keywords.filter(
      (k) => k.is_active && k.target === LeadKeywordTarget.AUTHOR_PROFILE
    );

    for (const keyword of authorProfileKeywords) {
      const rule = (keyword.keyword ?? "").trim();
      if (!rule) continue;
      if (rule.length < MIN_AUTHOR_PROFILE_KEYWORD_LENGTH) continue;

      for (const field of fields) {
        let ok = false;
        if (keyword.match_type === LeadMatchType.CONTAINS) {
          ok = matchesContains(rule, field);
        } else if (keyword.match_type === LeadMatchType.EXACT) {
          ok = matchesExact(rule, field);
        } else if (keyword.match_type === LeadMatchType.REGEX) {
          ok = matchesRegex(rule, field);
        }

        if (!ok) continue;

        matchedKeywords.push({
          keywordId: keyword.id,
          keyword: rule,
          matchType: keyword.match_type,
          target: LeadKeywordTarget.AUTHOR_PROFILE,
          field: field.field,
          valuePreview: shorten(field.value.trim(), VALUE_PREVIEW_MAX_LENGTH),
          score: keyword.priority
        });
      }
    }

    const score = matchedKeywords.reduce((sum, match) => sum + (Number.isFinite(match.score) ? match.score : 0), 0);
    const firstMatch = matchedKeywords[0];
    const reason = firstMatch
      ? shorten(`Профиль автора совпал: "${firstMatch.keyword}" найдено в ${fieldReasonLabel(firstMatch.field)}`, REASON_MAX_LENGTH)
      : "Профиль автора не совпал с правилами";

    return {
      matched: matchedKeywords.length > 0,
      score,
      matchedKeywords,
      reason
    };
  }
}
