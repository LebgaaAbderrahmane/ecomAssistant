import prisma from '../../../config/db.config';
import { msgLogger } from '../../../lib/logger';
import { callLLM } from '../clients/llm.client';
import { parseReplyResponse, LLMParseError } from '../parser/response.parser';
import { buildReplyPrompt } from '../prompts/promptBuilder';
import { REPLY_RESPONSE_SCHEMA } from '../schemas/gemini.schemas';
import { intentToString } from '../schemas/intents.schemas';
import { openwaService } from '../../whatsapp/whatsapp.service';
import { persistFlowMemory } from '../flow/flowProcessor';
import type { ToolResultEntry } from '../execution/execution.types';
import { buildEffectiveText, collectProductCards, sendProductImages, customerRequestedImages } from '../outbound/product.media';
import type { Layer2ReplyState } from './reply.types';

// ─── Layer 2, step 2: reply generation ───────────────────────────────────
// Builds the reply from the executed tool results: LLM #2 → persist messages
// → send via WhatsApp → update memory. Only called when the AI owns the
// conversation (inline path) or after de-escalation (deferred path).
export async function generateResponse(
  messageId: string,
  toolResults: ToolResultEntry[],
  state: Layer2ReplyState,
): Promise<void> {
  const {
    sortedIntents,
    primaryIntent,
    conversationAct,
    tone,
    language,
    memory,
  } = state;

  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: { conversation: true },
  });
  const { conversation } = message;
  const log = msgLogger({ conversationId: conversation.id, messageId });
  const effectiveText = buildEffectiveText(message);
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: conversation.customerId },
  });

  // ─── LLM #2: reply generation (single call for all intents) ─────────
  const replyContext = {
    intents: sortedIntents.map(item => ({
      intent: intentToString(item.intent),
      entities: item.entities,
      status: item.status,
      candidates: item.candidates,
    })),
    conversationAct,
    toolResults,
    memory,
    tone,
    language,
  };

  const rawReply = await callLLM({
    systemPrompt: buildReplyPrompt(replyContext),
    userMessage: effectiveText,
    responseSchema: REPLY_RESPONSE_SCHEMA,
    context: {
      merchantId: conversation.merchantId,
      conversationId: conversation.id,
      messageId,
      purpose: 'reply',
    },
  });

  let replyParsed;
  try {
    replyParsed = parseReplyResponse(rawReply);
  } catch (err) {
    if (err instanceof LLMParseError) {
      log.error({ raw: err.raw }, 'failed to parse reply response');
    }
    throw err;
  }

  // Persist each reply message as a separate DB row
  for (const text of replyParsed.messages) {
    await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUT',
        sender: 'AI',
        content: text,
        text,
        role: 'assistant',
      },
    });
  }

  // ─── Send reply via WhatsApp (sequential with typing indicators) ─────
  try {
    const waSession = await prisma.whatsAppSession.findUnique({
      where: { merchantId: conversation.merchantId },
    });
    if (waSession && (waSession.status === 'connected' || waSession.status === 'ready')) {
      if (customer?.phone) {
        // When to accompany the reply with product photos:
        //  - Search results are always sent as images — showing the discovered
        //    products is the point.
        //  - Product details are sent as images only when the customer actually
        //    asked for a photo — either via LLM #1 extracting an explicit
        //    "images" field (the getProductDetails tool returns productImages
        //    only in that case) or via the text heuristic as a fallback.
        const hasSearchResults = toolResults.some((tr) => {
          const data = tr.result?.data as Record<string, unknown> | undefined;
          return (
            !!data &&
            Array.isArray(data.products) &&
            (data.products as unknown[]).length > 0
          );
        });
        const hasDetailsImages = toolResults.some((tr) => {
          const data = tr.result?.data as Record<string, unknown> | undefined;
          return (
            !!data &&
            Array.isArray(data.productImages) &&
            (data.productImages as unknown[]).length > 0
          );
        });
        const wantsPicture =
          customerRequestedImages(effectiveText) || hasDetailsImages;

        if (hasSearchResults || wantsPicture) {
          const productCards = collectProductCards(toolResults);
          if (productCards.length >= 1) {
            try {
              await sendProductImages(
                waSession.sessionId,
                customer.phone,
                productCards,
                log,
              );
              log.info({ to: customer.phone, count: productCards.length }, 'product images sent via WhatsApp');
            } catch (imgErr) {
              // Image failures must not abort the reply — fall through to text.
              log.warn({ err: imgErr, count: productCards.length }, 'failed to send product images, sending text reply only');
            }
          }
        }

        await openwaService.sendMessagesSequentially(
          waSession.sessionId,
          customer.phone,
          replyParsed.messages,
        );
        log.info({ to: customer.phone, count: replyParsed.messages.length }, 'reply sent via WhatsApp');
      } else {
        log.warn({ customerId: conversation.customerId }, 'no phone found for customer, reply not sent');
      }
    } else {
      log.warn({ merchantId: conversation.merchantId }, 'WhatsApp not connected, reply not sent');
    }
  } catch (err) {
    log.error({ err }, 'failed to send reply via WhatsApp');
  }

  // ─── Update conversation memory ─────────────────────────────────────
  await persistFlowMemory(conversation.id, memory);

  log.info(
    { intents: sortedIntents.map(i => intentToString(i.intent)), replyCount: replyParsed.messages.length },
    'pipeline completed',
  );
}
