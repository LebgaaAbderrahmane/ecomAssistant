import { msgLogger } from '../../../lib/logger';
import prisma from '../../../config/db.config';
import type { ToolExecutionContext } from '../tools/registry';
import { executeTool } from '../tools/registry';
import { recordSuggestion } from '../suggestedIntents.service';
import { isSuggestedIntent, intentToString } from '../schemas/intents.schemas';
import type { SuggestedIntentField } from '../schemas/intents.schemas';
import type { IntentItem } from '../schemas/ai.schemas';
import type { ConversationMemory } from '../memory.types';

/** Records any suggested intents the LLM proposed (count +1 each) for the
 *  merchant to review. Deduplicates within this message. */
export async function recordSuggestedIntents(
  suggestedItems: IntentItem[],
  log: ReturnType<typeof msgLogger>,
): Promise<void> {
  const seen = new Set<string>();
  for (const item of suggestedItems) {
    if (!isSuggestedIntent(item.intent)) continue;
    const suggested = item.intent as unknown as SuggestedIntentField;
    if (seen.has(suggested.name)) continue;
    seen.add(suggested.name);
    try {
      await recordSuggestion(suggested.name, suggested.description);
      log.info({ name: suggested.name }, 'recorded suggested intent');
    } catch (err) {
      log.error({ name: suggested.name, err }, 'failed to record suggested intent');
    }
  }
}

/** Hands the conversation over to a human via the escalateConversation tool.
 *  Returns true if the takeover was triggered. Only called when a suggested
 *  intent escalated the conversation and it wasn't already taken over. */
export async function escalateForSuggestedIntent(
  executionContext: ToolExecutionContext,
  log: ReturnType<typeof msgLogger>,
): Promise<boolean> {
  const result = await executeTool('escalateConversation', {}, executionContext);
  log.info({ outcome: result.outcome ?? (result.success ? 'SUCCESS' : 'FAIL') }, 'escalated conversation (suggested intent)');
  return true;
}

export interface EscalationCheckInput {
  conversationId: string;
  merchantId: string;
  customerId: string;
  memory: ConversationMemory;
  primaryIntent: IntentItem;
  conversationAct: string;
  threshold: number;
  log: ReturnType<typeof msgLogger>;
}

/** Application-level escalation safety net: if the customer is repeatedly
 *  frustrated/not-understood, mark the conversation as taken over by a human
 *  and notify the merchant. Returns the resulting takenOver state. */
export async function checkEscalationThreshold(
  input: EscalationCheckInput,
): Promise<boolean> {
  const {
    conversationId,
    merchantId,
    customerId,
    memory,
    primaryIntent,
    conversationAct,
    threshold,
    log,
  } = input;

  const recentIntents = (memory.recentIntents ?? []) as string[];
  const updatedRecentIntents = [...recentIntents, `${intentToString(primaryIntent.intent)}:${conversationAct}`].slice(-10);

  if (conversationAct !== 'DIDNT_UNDERSTAND' && conversationAct !== 'FRUSTRATED') {
    return false;
  }

  const consecutiveNegative = updatedRecentIntents
    .slice()
    .reverse()
    .filter((e) => e.endsWith(':DIDNT_UNDERSTAND') || e.endsWith(':FRUSTRATED'))
    .length;

  if (consecutiveNegative < threshold) {
    return false;
  }

  log.info({ consecutiveNegative, threshold }, 'escalation threshold reached, escalating');
  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      takenOverByHuman: true,
      escalatedAt: new Date(),
    },
  });

  // Send escalation notification to merchant
  try {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
    });
    await prisma.notification.create({
      data: {
        merchantId,
        type: 'escalation',
        title: 'Conversation escaladée',
        message: `Le client ${customer?.name || customer?.phone || 'inconnu'} a été transféré à un humain. ${consecutiveNegative} messages sans réponse satisfaisante.`,
        link: '/dashboard/escalations',
      },
    });
  } catch (err) {
    log.error({ err }, 'failed to create escalation notification');
  }

  return true;
}
