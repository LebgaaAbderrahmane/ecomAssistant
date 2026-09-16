import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runAgentBridge, type AgentBridgeDeps } from '../agentBridgeCore';

const makeDeps = (overrides: Partial<AgentBridgeDeps> = {}): AgentBridgeDeps => ({
  findMessage: async () => ({
    id: 'm1',
    conversation: {
      id: 'conv-1',
      merchantId: 'mer-1',
      customerId: 'cus-1',
      takenOverByHuman: false,
    },
  }),
  findCustomer: async () => ({ id: 'cus-1', name: 'Client', phone: '+21369999991' }),
  callAgent: async () => ({ decision: 'DECISION_REPLY', text: 'Bonjour, comment puis-je vous aider ?' }),
  deliverReply: async () => {},
  escalate: async () => {},
  ...overrides,
});

describe('runAgentBridge error paths', () => {
  it('takeover: reply suppressed — agent never called, nothing delivered', async (t) => {
    let agentCalled = 0;
    let delivered = 0;
    const deps = makeDeps({
      findMessage: async () => ({
        id: 'm1',
        conversation: {
          id: 'conv-1',
          merchantId: 'mer-1',
          customerId: 'cus-1',
          takenOverByHuman: true,
        },
      }),
      callAgent: async () => {
        agentCalled++;
        return { decision: 'DECISION_REPLY', text: 'auto reply' };
      },
      deliverReply: async () => {
        delivered++;
      },
    });

    await runAgentBridge('m1', deps);

    assert.equal(agentCalled, 0);
    assert.equal(delivered, 0);
  });

  it('agent down: error rethrown so the job fails and BullMQ retries', async () => {
    const deps = makeDeps({
      callAgent: async () => {
        throw new Error('agent unreachable');
      },
    });

    await assert.rejects(() => runAgentBridge('m1', deps), /agent unreachable/);
  });

  it('reply decision: agent text is delivered via deliverReply', async (t) => {
    const delivered: Array<[string, string]> = [];
    let escalated = 0;
    const deps = makeDeps({
      callAgent: async () => ({ decision: 'DECISION_REPLY', text: 'Voici votre réponse' }),
      deliverReply: async (conversationId, text) => {
        delivered.push([conversationId, text]);
      },
      escalate: async () => {
        escalated++;
      },
    });

    await runAgentBridge('m1', deps);

    assert.deepEqual(delivered, [['conv-1', 'Voici votre réponse']]);
    assert.equal(escalated, 0);
  });

  it('escalate decision: hands the conversation to a human, no auto-reply', async (t) => {
    let delivered = 0;
    let escalated = 0;
    const deps = makeDeps({
      callAgent: async () => ({ decision: 'DECISION_ESCALATE', text: '' }),
      deliverReply: async () => {
        delivered++;
      },
      escalate: async () => {
        escalated++;
      },
    });

    await runAgentBridge('m1', deps);

    assert.equal(escalated, 1);
    assert.equal(delivered, 0);
  });

  it('unavailable decision: escalates to a human as well', async (t) => {
    let escalated = 0;
    const deps = makeDeps({
      callAgent: async () => ({ decision: 'DECISION_UNAVAILABLE', text: '' }),
      escalate: async () => {
        escalated++;
      },
    });

    await runAgentBridge('m1', deps);

    assert.equal(escalated, 1);
  });
});