import type { ProcessMessageRequest, ProcessMessageResponse } from '../../grpc/agent.client';

export interface AgentBridgeDeps {
  findMessage: (
    messageId: string
  ) => Promise<{
    id: string;
    conversation: {
      id: string;
      merchantId: string;
      customerId: string;
      takenOverByHuman: boolean;
    };
  } | null>;
  findCustomer: (
    customerId: string
  ) => Promise<{ id: string; name: string | null; phone: string | null } | null>;
  callAgent: (request: ProcessMessageRequest) => Promise<ProcessMessageResponse>;
  deliverReply: (conversationId: string, text: string) => Promise<void>;
  escalate: (
    conversation: { id: string; merchantId: string },
    customer: { id: string; name: string | null; phone: string | null } | null
  ) => Promise<void>;
}

/**
 * gRPC message destination: load the inbound message
 * and forward it to the Python agent's AgentService.ProcessMessage. The agent's
 * reply is persisted + sent by the backend; DECISION_ESCALATE / unavailability
 * hand the conversation to a human. A human-owned conversation is never given
 * an auto-reply. If the agent call fails the error is rethrown so the job
 * fails and BullMQ retries it.
 */
export const runAgentBridge = async (
  messageId: string,
  deps: AgentBridgeDeps,
): Promise<void> => {
  const message = await deps.findMessage(messageId);
  if (!message) {
    throw new Error(`message ${messageId} not found`);
  }
  const { conversation } = message;

  if (conversation.takenOverByHuman) {
    console.log(`[message] ${messageId} -> human owns conversation, skipping agent, reply not auto-sent`);
    return;
  }
  const customer = await deps.findCustomer(conversation.customerId);

  console.log(`[message] ${messageId} -> agent`);
  const response = await deps.callAgent({
    messageId,
    conversationId: conversation.id,
    merchantId: conversation.merchantId,
    customerId: conversation.customerId,
  });

  if (response.decision === 'DECISION_REPLY' && response.text.trim()) {
    await deps.deliverReply(conversation.id, response.text);
    console.log(`[message] ${messageId} -> agent reply: "${response.text}"`);
    return;
  }

  console.log(`[message] ${messageId} -> agent decision ${response.decision}, escalating to human`);
  await deps.escalate(conversation, customer);
  console.log(`[message] ${messageId} -> conversation handed to human`);
};