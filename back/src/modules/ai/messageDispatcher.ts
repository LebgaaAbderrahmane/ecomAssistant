export type MessageHandler = (messageId: string) => Promise<void>;

/**
 * Route an inbound message to the configured destination handler. Pure and
 * dependency-injected so the worker assignment can be unit-tested without a
 * Redis connection or the legacy/grpc pipelines.
 */
export const dispatchInboundMessage = async (
  messageId: string,
  handlers: Record<'grpc' | 'legacy', MessageHandler>,
  mode: 'grpc' | 'legacy',
): Promise<void> => {
  await handlers[mode](messageId);
};