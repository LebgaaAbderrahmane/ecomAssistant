import prisma from "../../config/db.config";
import { IntentSchema } from "./schemas/intents.schemas";

const COVERED_INTENTS = new Set<string>(IntentSchema.options as readonly string[]);

export interface SuggestedIntentSummary {
  name: string;
  description: string | null;
}

/**
 * Persist (or bump) a suggested intent. Only uncovered intents are stored —
 * if the name is already a covered enum value it is ignored.
 */
export const recordSuggestion = async (name: string, description?: string | null) => {
  if (COVERED_INTENTS.has(name)) {
    return null;
  }

  return prisma.suggestedIntent.upsert({
    where: { name },
    create: { name, description: description ?? null, count: 1 },
    update: {
      count: { increment: 1 },
      lastSeenAt: new Date(),
      ...(description ? { description } : {}),
    },
  });
};

/**
 * Top suggested intents by count, excluding any name that has since been
 * covered by the enum. Used to seed the intent extraction prompt so the LLM
 * reuses existing suggestions instead of creating duplicates.
 */
export const topSuggested = async (limit = 10): Promise<SuggestedIntentSummary[]> => {
  const rows = await prisma.suggestedIntent.findMany({
    orderBy: { count: "desc" },
    take: limit * 3,
  });

  return rows
    .filter((r) => !COVERED_INTENTS.has(r.name))
    .slice(0, limit)
    .map((r) => ({ name: r.name, description: r.description }));
};
