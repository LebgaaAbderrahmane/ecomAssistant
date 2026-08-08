import { z } from "zod";
import { PLAN_KEYS, type PlanKey } from "../config/plans";

export const BillingSchema = z.object({
  plan: z.enum(PLAN_KEYS as [PlanKey, ...PlanKey[]]),
});

export type BillingInput = z.infer<typeof BillingSchema>;
