import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runLegacyPipelineWithFallback, type LegacyPipelineDeps } from '../legacyWithFallbackCore';

const makeDeps = (overrides: Partial<LegacyPipelineDeps> = {}): LegacyPipelineDeps => ({
  runPipeline: async () => {},
  findConversationId: async () => 'conv-1',
  deliverFallback: async () => {},
  ...overrides,
});

describe('runLegacyPipelineWithFallback (LLM failure error path)', () => {
  it('happy path: pipeline succeeded, no fallback, no failure logged', async (t) => {
    const errorSpy = t.mock.method(console, 'error');
    const delivered: string[] = [];
    const deps = makeDeps({
      deliverFallback: async (conversationId) => {
        delivered.push(conversationId);
      },
    });

    await runLegacyPipelineWithFallback('m1', deps);

    assert.deepEqual(delivered, []);
    assert.equal(errorSpy.mock.callCount(), 0);
  });

  it('LLM failure: fallback reply delivered to the right conversation + failure logged', async (t) => {
    const errorSpy = t.mock.method(console, 'error');
    const delivered: string[] = [];
    const deps = makeDeps({
      runPipeline: async () => {
        throw new Error('LLM request failed');
      },
      deliverFallback: async (conversationId) => {
        delivered.push(conversationId);
      },
    });

    await runLegacyPipelineWithFallback('m1', deps);

    assert.deepEqual(delivered, ['conv-1']);
    assert.equal(errorSpy.mock.callCount(), 1);
    assert.match(errorSpy.mock.calls[0].arguments[0] as string, /failed/);
  });

  it('LLM failure: rethrows when the message row cannot be routed for fallback', async () => {
    const deps = makeDeps({
      runPipeline: async () => {
        throw new Error('LLM request failed');
      },
      findConversationId: async () => null,
    });

    await assert.rejects(() => runLegacyPipelineWithFallback('gone', deps), /message not found/);
  });

  it('LLM failure: rethrows when the fallback delivery itself fails (job fails -> BullMQ retry)', async () => {
    const deps = makeDeps({
      runPipeline: async () => {
        throw new Error('LLM request failed');
      },
      deliverFallback: async () => {
        throw new Error('database offline');
      },
    });

    await assert.rejects(() => runLegacyPipelineWithFallback('m1', deps), /database offline/);
  });
});