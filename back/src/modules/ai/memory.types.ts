// Shared shape for Conversation.memory (a Json column). Lives here, not in
// agent.service.ts, so both agent.service.ts and prompts/promptBuilder.ts can
// depend on it without depending on each other.
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
