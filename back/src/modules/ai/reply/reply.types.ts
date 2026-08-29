import type { IntentItem } from '../schemas/ai.schemas';
import type { ConversationMemory } from '../memory.types';

export type Layer2ReplyState = {
  sortedIntents: IntentItem[];
  primaryIntent: IntentItem;
  conversationAct: string;
  tone: string;
  language: string;
  memory: ConversationMemory;
};
