import type { Env } from "../config/env.js";

const normalizeEmail = (value: string) => value.trim().toLowerCase();

export const parseAdminEmails = (raw: string | undefined): Set<string> => {
  if (!raw?.trim()) {
    return new Set();
  }

  return new Set(
    raw
      .split(",")
      .map((entry) => normalizeEmail(entry))
      .filter(Boolean)
  );
};

export const isPlatformAdmin = (env: Env, email: string) => {
  const allow = parseAdminEmails(env.ADMIN_EMAILS);
  if (allow.size === 0) {
    return false;
  }

  return allow.has(normalizeEmail(email));
};
