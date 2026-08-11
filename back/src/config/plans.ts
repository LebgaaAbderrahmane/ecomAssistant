export const PLANS = {
  base: { name: "Base", amount: 10000, currency: "dzd" },
  max: { name: "Max", amount: 30000, currency: "dzd" },
  entreprise: { name: "Entreprise", amount: 100000, currency: "dzd" },
} as const;

export type PlanKey = keyof typeof PLANS;

export const PLAN_KEYS = Object.keys(PLANS) as PlanKey[];
