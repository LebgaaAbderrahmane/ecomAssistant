import { createAgentClient, agentProcessMessage, closeAgentClient } from '../src/grpc/agent.client.js';

const client = createAgentClient();
try {
  const res = await agentProcessMessage(client, {
    messageId: process.env.MESSAGE_ID ?? 'test-msg-1',
    conversationId: process.env.CONVERSATION_ID ?? 'test-conv-1',
    merchantId: process.env.MERCHANT_ID ?? 'test-merchant',
    customerId: process.env.CUSTOMER_ID ?? 'test-customer',
  });
  console.log(res.decision, '|', JSON.stringify(res.text));
} finally {
  closeAgentClient(client);
}