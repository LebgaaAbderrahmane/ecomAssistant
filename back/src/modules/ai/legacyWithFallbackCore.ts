export interface LegacyPipelineDeps {
  runPipeline: (messageId: string) => Promise<void>;
  findConversationId: (messageId: string) => Promise<string | null>;
  deliverFallback: (conversationId: string) => Promise<void>;
}

/**
 * Legacy message destination with an error fallback: if the local Gemini
 * pipeline throws (LLM down, parse failure, ...) the customer still receives a
 * graceful fallback reply and the failure is logged. Only when the fallback
 * itself cannot be routed (message row gone, DB down) is the error rethrown so
 * the job fails and BullMQ retries it.
 */
export const runLegacyPipelineWithFallback = async (
  messageId: string,
  deps: LegacyPipelineDeps,
): Promise<void> => {
  try {
    await deps.runPipeline(messageId);
  } catch (err) {
    console.error(`[message] ${messageId} -> legacy pipeline failed, sending fallback reply:`, err);
    const conversationId = await deps.findConversationId(messageId);
    if (!conversationId) {
      throw new Error(`cannot route fallback for ${messageId}: message not found`);
    }
    await deps.deliverFallback(conversationId);
  }
};