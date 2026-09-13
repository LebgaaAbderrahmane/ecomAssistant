import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { dispatchInboundMessage, type MessageHandler } from '../messageDispatcher';

describe('dispatchInboundMessage (worker branch)', () => {
  it('routes to the grpc handler when MESSAGE_HANDLER=grpc', async (t) => {
    const calls: string[] = [];
    const grpc: MessageHandler = t.mock.fn(async (messageId: string) => {
      calls.push(`grpc:${messageId}`);
    }) as unknown as MessageHandler;
    const legacy: MessageHandler = t.mock.fn(async (messageId: string) => {
      calls.push(`legacy:${messageId}`);
    }) as unknown as MessageHandler;

    await dispatchInboundMessage('m1', { grpc, legacy }, 'grpc');

    assert.deepEqual(calls, ['grpc:m1']);
  });

  it('routes to the legacy handler when MESSAGE_HANDLER=legacy', async (t) => {
    const calls: string[] = [];
    const grpc: MessageHandler = t.mock.fn(async (messageId: string) => {
      calls.push(`grpc:${messageId}`);
    }) as unknown as MessageHandler;
    const legacy: MessageHandler = t.mock.fn(async (messageId: string) => {
      calls.push(`legacy:${messageId}`);
    }) as unknown as MessageHandler;

    await dispatchInboundMessage('m1', { grpc, legacy }, 'legacy');

    assert.deepEqual(calls, ['legacy:m1']);
    assert.equal((grpc as unknown as { mock: { callCount: () => number } }).mock.callCount(), 0);
  });

  it('forwards the message id to the selected handler', async (t) => {
    const seen: string[] = [];
    const grpc: MessageHandler = t.mock.fn(async (messageId: string) => {
      seen.push(messageId);
    }) as unknown as MessageHandler;

    await dispatchInboundMessage('m-42', { grpc, legacy: grpc }, 'grpc');

    assert.deepEqual(seen, ['m-42']);
  });
});