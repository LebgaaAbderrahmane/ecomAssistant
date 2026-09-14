// Shared shape for Conversation.memory (a Json column). Lives here so the tool
// context builder (toolContext.ts) and tool helpers can depend on it without
// creating a circular import.
export interface ProductResult {
  id: string;
  name: string;
}

export interface IntentSummary {
  intent: string;
  entities: Record<string, string | number | boolean | null>;
}

export interface ConversationMemory {
  lastIntent?: string;
  lastIntents?: IntentSummary[];
  lastConversationAct?: string;
  entities?: Record<string, string | number | boolean | null>;
  recentIntents?: string[];
  lastProductResults?: ProductResult[];
  // Products the customer explicitly rejected ("no, not that one"). Excluded
  // from future suggestProducts recommendations but still findable by search.
  rejectedProducts?: ProductResult[];
  updatedAt?: string;
}
