import type { IntentField } from '../schemas/intents.schemas';
import type { IntentItem } from '../schemas/ai.schemas';

// Message templates used as fallbacks / defaults.
export const DEFAULT_TEMPLATES: Record<string, string> = {
  orderConfirmation: [
    "Bonjour {clientName},",
    "",
    "Votre commande #{orderId} pour \"{productName}\" a bien été reçue.",
    "",
    "Montant: {totalAmount} DA",
    "Wilaya: {wilaya}",
    "",
    "Merci pour votre confiance !",
  ].join("\n"),
  cartFollowUp: [
    "Bonjour {clientName},",
    "",
    "J'ai remarqué que vous étiez intéressé par \"{productName}\". Avez-vous des questions ?",
  ].join("\n"),
  greeting: [
    "Bienvenue chez {shopName} ! 👋",
    "",
    "Comment puis-je vous aider ?",
  ].join("\n"),
};

// Hardcoded priority for safety-net sorting when LLM assigns wrong order.
const INTENT_PRIORITY: Record<string, number> = {
  PRODUCT_SEARCH: 1,
  PRODUCT_SELECT: 1,
  PRODUCT_DETAILS: 1,
  PRODUCT_SUGGEST: 1,
  ORDER_MODIFY: 2,
  SHIPPING_CHECK: 3,
  ORDER_CREATE: 4,
  ORDER_CONFIRM: 4,
  ORDER_CANCEL: 4,
  STATUS_CHECK: 5,
  ESCALATION: 5,
  OUT_OF_SCOPE: 5,
  GOODBYE: 5,
};

export function intentPriority(intent: IntentField): number {
  return typeof intent === 'string' ? (INTENT_PRIORITY[intent] ?? 5) : 5;
}

/** Sort intents by LLM-assigned order, with hardcoded priority as tiebreaker. */
export function sortIntents(intents: IntentItem[]): IntentItem[] {
  return [...intents].sort((a, b) => {
    const orderDiff = a.order - b.order;
    if (orderDiff !== 0) return orderDiff;
    // Tiebreak by hardcoded priority (lower = first)
    return intentPriority(a.intent) - intentPriority(b.intent);
  });
}
