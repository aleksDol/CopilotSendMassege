export type PlanCode = "FREE" | "PRO" | "TEAM";

export type PlanConfig = {
  code: PlanCode;
  aiSuggestionsPerMonth: number;
  maxUsers: number;
  fullAiFeatures: boolean;
};

export const PLAN_CONFIGS: Record<PlanCode, PlanConfig> = {
  FREE: {
    code: "FREE",
    aiSuggestionsPerMonth: 100,
    maxUsers: 1,
    fullAiFeatures: false
  },
  PRO: {
    code: "PRO",
    aiSuggestionsPerMonth: 2000,
    maxUsers: 1,
    fullAiFeatures: true
  },
  TEAM: {
    code: "TEAM",
    aiSuggestionsPerMonth: 10000,
    maxUsers: 5,
    fullAiFeatures: true
  }
};

export const resolvePlanConfig = (plan: string): PlanConfig => {
  const normalized = plan.toUpperCase();
  if (normalized === "PRO") return PLAN_CONFIGS.PRO;
  if (normalized === "TEAM") return PLAN_CONFIGS.TEAM;
  return PLAN_CONFIGS.FREE;
};
