import type { Prisma } from '@prisma/client';
import prisma from '../../config/db.config';
import { callLLM } from './clients/llm.client';
import { parseResponse, LLMParseError } from './parser/response.parser';
import { buildIntentPrompt, AgentContext } from './prompts/promptBuilder';
import { IntentSchema, isSuggestedIntent, intentToString } from './schemas/intents.schemas';
import { topSuggested } from './suggestedIntents.service';
import { migrateMemory, getActiveFlow } from './flow/flowHelper';
import { persistFlowMemory } from './flow/flowProcessor';
import { resolveFlow, toFlowResolverEntities } from './flow/flowResolver';
import type { IntentItem } from './schemas/ai.schemas';
import { INTENT_RESPONSE_SCHEMA } from './schemas/gemini.schemas';
import { openwaService } from '../whatsapp/whatsapp.service';
import { enqueueLayer2Job } from '../../queues/layer2.queue';
import { decideLayer2JobKind } from './layer2JobKind';
import { msgLogger } from '../../lib/logger';
import { sortIntents, intentPriority } from './intent/intent.sort';
import { executeTools } from './execution/tool.executor';
import type { ToolResultEntry } from './execution/execution.types';
import { generateResponse } from './reply/reply.generator';
import { applyFlowResolution } from './flow/flow.orchestrator';
import { recordSuggestedIntents, escalateForSuggestedIntent, checkEscalationThreshold } from './escalation/escalation.service';
import { buildEffectiveText } from './outbound/product.media';
import { getRecentMessages } from './conversation/history.service';

const ALL_INTENTS = IntentSchema.options as readonly string[] as string[];

export const processMessage = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = migrateMemory(conversation.memory);

  const log = msgLogger({ conversationId: conversation.id, messageId });

  log.info(
    {
      text: message.text?.slice(0, 200),
      messageType: message.messageType,
      direction: message.direction,
      conversationState: conversation.state,
      takenOver: conversation.takenOverByHuman,
      flowCount: memory.flows.length,
      activeFlowId: memory.activeFlow ?? null,
      flowSummaries: memory.flows.map((f) => ({
        flowId: f.flowId.slice(0, 8),
        state: f.state,
        product: 'productDiscovery' in f ? f.productDiscovery.input.productName : null,
      })),
    },
    'processMessage: received',
  );

  // Was the human already in control when this message arrived? Read before any
  // processing: the deferred path applies only to pre-existing takeover, not to
  // escalations triggered by this very message.
  const wasTakenOver = conversation.takenOverByHuman;

  // Last messages in this conversation (both directions, oldest → newest),
  // excluding the current client message being processed (it is supplied to
  // LLM #1 separately as the input turn, not duplicated in the history).
  // LLM #1 needs the history to interpret short follow-ups ("okay", "yes",
  // "this one") relative to what was actually said recently, rather than
  // reading them off the raw conversation state (which may be stale).
  const recentMessages = await getRecentMessages(conversation.id, {
    limit: 10,
    excludeId: messageId,
  });
  // Keep the single last-assistant-message field for any consumers that rely on
  // it; derive it from the transcript rather than issuing a second query.
  const lastAssistantMessage =
    [...recentMessages].reverse().find((m) => m.sender === 'assistant')?.text ?? null;

  // --- Load AgentConfig ---
  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId: conversation.merchantId },
  });

  const tone = agentConfig?.tone ?? 'friendly';
  const defaultLanguage = agentConfig?.defaultLanguage ?? 'auto';
  const escalationThreshold = agentConfig?.escalationThreshold ?? 3;

  // --- LLM #1: intent extraction ---
  // Fetch customer record for delivery info and WhatsApp sending
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  // ─── Image category routing ─────────────────────────────────────────
  // If the message is an image, route by category before LLM #1 sees it.
  // The description is already in message.content from the captioning service.
  const effectiveText = buildEffectiveText(message);

  // ─── Empty message guard ────────────────────────────────────────────
  // No transcribable content (e.g. media omitted by the gateway). Skip the LLM
  // pipeline entirely — never let empty input hallucinate an intent like
  // ORDER_CONFIRM. If a human owns the conversation, stay silent entirely.
  if (!effectiveText || !effectiveText.trim()) {
    if (conversation.takenOverByHuman) {
      log.info('empty message in human-owned conversation, ignored');
      return;
    }

    const fallbackReply = "Désolé, je n'ai pas bien compris votre message. Pouvez-vous réessayer par texte ou me l'envoyer à nouveau ?";
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        content: fallbackReply,
        text: fallbackReply,
        role: 'assistant',
      },
    });

    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready') && customer?.phone) {
      try {
        await openwaService.sendText(waSession.sessionId, customer.phone, fallbackReply);
      } catch (err) {
        log.error({ err }, 'failed to send fallback reply');
      }
    }

    await persistFlowMemory(conversation.id, memory);
    log.info('empty message, replied with clarifying fallback');
    return;
  }

  // ─── LLM #1: multi-intent extraction (always runs, even if taken over) ─
  // LLM #1 keeps working so we keep collecting intent data + suggested intents.
  const knownSuggestedIntents = await topSuggested(10);
  const intentContext: AgentContext = {
    state: conversation.state,
    allowedIntents: ALL_INTENTS,
    knownSuggestedIntents,
    lastAssistantMessage,
    recentMessages,
  };


  log.info({
    systemPrompt: buildIntentPrompt(intentContext),
    userMessage: effectiveText,
    responseSchema: INTENT_RESPONSE_SCHEMA,
    context: {
      merchantId: conversation.merchantId,
      conversationId: conversation.id,
      messageId,
      purpose: 'intent',
    },
  },'the prompt sent to the llm to extract intents')

  const rawIntent = await callLLM({
    systemPrompt: buildIntentPrompt(intentContext),
    userMessage: effectiveText,
    responseSchema: INTENT_RESPONSE_SCHEMA,
    context: {
      merchantId: conversation.merchantId,
      conversationId: conversation.id,
      messageId,
      purpose: 'intent',
    },
  });

  let parsed;
  try {
    parsed = parseResponse(rawIntent);
    log.info({ intentCount: parsed.intents.length, intents: parsed.intents.map(i => `${intentToString(i.intent)}(${i.confidence.toFixed(2)})`) }, 'extracted intents');
  } catch (err) {
    if (err instanceof LLMParseError) {
      log.error({ raw: err.raw }, 'failed to parse intent response');
    }
    throw err;
  }

  // Sort intents by logical execution order (LLM order + safety-net priority)
  const sortedIntents = sortIntents(parsed.intents);

  // Log when safety net overrides LLM order (useful for prompt tuning)
  for (let i = 0; i < sortedIntents.length; i++) {
    const item = sortedIntents[i];
    const expectedPriority = intentPriority(item.intent);
    if (item.order !== i + 1) {
      log.info({ intent: intentToString(item.intent), originalOrder: item.order, newPosition: i + 1, priority: expectedPriority }, 'safety-net order override');
    }
  }

  // Save primary intent to message record (backward compat)
  const primaryIntent = sortedIntents[0];

  log.info(
    {
      primaryIntent: intentToString(primaryIntent.intent),
      primaryEntities: primaryIntent.entities,
      conversationAct: parsed.conversationAct,
      allIntents: sortedIntents.map((i) => ({
        intent: intentToString(i.intent),
        entities: i.entities,
        confidence: i.confidence,
        status: i.status,
        order: i.order,
      })),
    },
    'intent details',
  );

  await prisma.message.update({
    where: { id: messageId },
    data: {
      intent: intentToString(primaryIntent.intent),
      entities: primaryIntent.entities,
      confidence: primaryIntent.confidence,
      parsedIntents: sortedIntents as unknown as Prisma.InputJsonValue,
      refersToPreviousFlow: parsed.refersToPreviousFlow,
    },
  });

  // ─── Flow resolution (primary intent) ──────────────────────────────────
  // Determines which flow this message continues, creates, or switches to.
  // Runs after intent extraction but before tool execution so the execution
  // context always has the correct activeFlow.
  const resolverEntities = toFlowResolverEntities(primaryIntent.entities);
  log.info(
    {
      intent: intentToString(primaryIntent.intent),
      resolverEntities,
      activeFlowId: memory.activeFlow ?? null,
      flowCount: memory.flows.length,
    },
    'flow resolution: input',
  );

  const resolverResult = resolveFlow({
    extraction: {
      intent: primaryIntent.intent,
      entities: resolverEntities,
      confidence: primaryIntent.confidence,
    },
    conversation: {
      activeFlowId: memory.activeFlow ?? null,
      flows: memory.flows,
    },
    refersToPreviousFlow: parsed.refersToPreviousFlow,
  });

  log.info(
    {
      action: resolverResult.action,
      intent: intentToString(primaryIntent.intent),
      ...(resolverResult.action === 'CREATE' && { productName: resolverResult.productName }),
      ...(resolverResult.action === 'CONTINUE' && { flowId: resolverResult.flowId }),
      ...(resolverResult.action === 'SWITCH' && { flowId: resolverResult.flowId }),
      ...(resolverResult.action === 'INVALID_ACTION' && { reason: resolverResult.reason }),
      ...(resolverResult.action === 'CLARIFY' && { candidates: resolverResult.candidates.map(c => ({ flowId: c.flowId.slice(0, 8), score: c.score, signals: c.matchedSignals, summary: c.summary })) }),
    },
    'flow resolution: result',
  );

  applyFlowResolution(memory, resolverResult, log);

  // Persist flow resolution changes (new flows, updated activeFlow) before tool
  // execution so the deferred path (which re-reads from DB) sees the correct state.
  await persistFlowMemory(conversation.id, memory);

  const executionContext = {
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
    conversationId: conversation.id,
    activeFlow: getActiveFlow(memory) ?? null,
    customerWilaya: customer.wilaya,
    customerCommune: customer.commune,
  };

  log.info(
    {
      activeFlowId: executionContext.activeFlow?.flowId.slice(0, 8) ?? null,
      activeFlowState: executionContext.activeFlow?.state ?? null,
      activeFlowProduct: executionContext.activeFlow && 'productDiscovery' in executionContext.activeFlow
        ? executionContext.activeFlow.productDiscovery.input.productName
        : null,
    },
    'execution context',
  );

  // ─── Suggested intents: record + escalate ───────────────────────────
  // When the LLM proposes a new intent, we persist it (count +1) and hand the
  // conversation over to a human. The AI then stops: no tools, no reply.
  const suggestedItems = sortedIntents.filter(item => isSuggestedIntent(item.intent));
  let takenOver = conversation.takenOverByHuman;

  if (suggestedItems.length > 0) {
    await recordSuggestedIntents(suggestedItems, log);

    if (!takenOver) {
      takenOver = await escalateForSuggestedIntent(executionContext, log);
    }

    // A suggested intent hands the conversation to a human immediately — no
    // tools, no reply, no deferral. The merchant picks it up from the dashboard.
    return;
  }

  // ─── Escalation threshold (existing safety net) ─────────────────────
  if (!takenOver) {
    const escalated = await checkEscalationThreshold({
      conversationId: conversation.id,
      merchantId: conversation.merchantId,
      customerId: conversation.customerId,
      memory,
      primaryIntent,
      conversationAct: parsed.conversationAct,
      threshold: escalationThreshold,
      log,
    });
    if (escalated) {
      takenOver = true;
    }
  }

  // ─── Layer 2: dispatch ────────────────────────────────────────────────
  // wasTakenOver → the human already owned the conversation when this message
  // arrived. Write tools execute immediately; their results + the parsed
  // intents are persisted, and read tools + the reply are deferred to the
  // agent-layer2 queue (which de-escalates before generating).
  if (wasTakenOver) {
    const outcome = await executeTools(messageId, sortedIntents, { only: 'write' });

    await prisma.message.update({
      where: { id: messageId },
      data: {
        toolResults: outcome.toolResults as unknown as Prisma.InputJsonValue,
      },
    });

    const kind = decideLayer2JobKind(sortedIntents);
    await enqueueLayer2Job(message.id, conversation.id, kind);
    log.info({ kind }, 'deferred layer-2');
    return;
  }

  // Escalated by this message itself (threshold safety net): write tools still
  // run, but the AI stays silent — the merchant now owns the conversation.
  if (takenOver) {
    await executeTools(messageId, sortedIntents, { only: 'write' });
    return;
  }

  // AI owns the conversation: full inline pipeline.
  const outcome = await executeTools(messageId, sortedIntents);

  await generateResponse(messageId, outcome.toolResults, {
    sortedIntents,
    primaryIntent,
    conversationAct: parsed.conversationAct,
    tone,
    language: defaultLanguage,
    memory: outcome.memory,
  });
};

// ─── Deferred Layer 2 (after human takeover) ─────────────────────────────
// Runs when a message that arrived under human takeover is processed after the
// fact. The write tools already ran during the takeover (their results are
// stored on the message); here the conversation is handed back to the AI, the
// deferred read tools execute, and the final reply is generated from the merged
// results.
export const processDeferredLayer2 = async (messageId: string) => {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const memory = migrateMemory(conversation.memory);

  const log = msgLogger({ conversationId: conversation.id, messageId });

  log.info(
    {
      conversationState: conversation.state,
      flowCount: memory.flows.length,
      activeFlowId: memory.activeFlow ?? null,
    },
    'processDeferredLayer2: received',
  );

  const parsedIntents = (message.parsedIntents as unknown as IntentItem[] | null) ?? [];
  if (parsedIntents.length === 0) {
    log.info('no parsedIntents to process, nothing deferred');
    return;
  }

  const sortedIntents = sortIntents(parsedIntents);
  const primaryIntent = sortedIntents[0];

  log.info(
    {
      primaryIntent: intentToString(primaryIntent.intent),
      primaryEntities: primaryIntent.entities,
      allIntents: sortedIntents.map(i => intentToString(i.intent)),
    },
    'processDeferredLayer2: intent details',
  );

  // ─── Flow resolution (primary intent) ──────────────────────────────────
  // Re-resolve so the active flow is correct before read tools execute.
  // This mirrors the resolution step in processMessage — the deferred path
  // runs after the original flow resolution was already persisted (by the
  // main pipeline), but memory may have changed since (merchant messages,
  // other deferred jobs), so re-resolve is safer.
  const resolverResult = resolveFlow({
    extraction: {
      intent: primaryIntent.intent,
      entities: toFlowResolverEntities(primaryIntent.entities),
      confidence: primaryIntent.confidence,
    },
    conversation: {
      activeFlowId: memory.activeFlow ?? null,
      flows: memory.flows,
    },
    refersToPreviousFlow: message.refersToPreviousFlow,
  });

  log.debug(
    { action: resolverResult.action, intent: intentToString(primaryIntent.intent) },
    'flow resolution (deferred)',
  );

  applyFlowResolution(memory, resolverResult, log, 'deferred');

  // Persist flow resolution before tool execution so executeTools (which
  // re-reads from DB) sees the correct activeFlow.
  await persistFlowMemory(conversation.id, memory);

  // ─── Conversation hand-back ─────────────────────────────────────────────
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { takenOverByHuman: false, escalatedAt: null },
  });

  const agentConfig = await prisma.agentConfig.findUnique({
    where: { merchantId: conversation.merchantId },
  });
  const tone = agentConfig?.tone ?? 'friendly';
  const language = agentConfig?.defaultLanguage ?? 'auto';

  // Deferred read tools — write tools already ran while the human owned the
  // conversation and their results are persisted on the message.
  const outcome = await executeTools(messageId, sortedIntents, { only: 'read' });

  // Merge the write-tool results stored at execution time with the reads just
  // executed. Read tools were excluded from the write-only pass, so no intent
  // appears twice.
  const storedToolResults = (message.toolResults as unknown as ToolResultEntry[] | null) ?? [];
  const toolResults = [...storedToolResults, ...outcome.toolResults];

  await generateResponse(messageId, toolResults, {
    sortedIntents,
    primaryIntent,
    conversationAct: 'ANSWER',
    tone,
    language,
    memory: outcome.memory,
  });
};
