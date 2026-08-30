import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const llmUsageCreateMany = vi.fn();

vi.mock('../../../config/db.config', () => ({
  default: {
    llmUsage: {
      createMany: (...a: unknown[]) => llmUsageCreateMany(...a),
    },
  },
}));

import { recordLlmUsage, flushLlmUsage } from '../usage/llmUsage.service';

const baseRecord = {
  model: 'gemini-3.5-flash',
  promptTokens: 10,
  completionTokens: 5,
  latencyMs: 120,
  attempt: 1,
  success: true,
};

describe('llmUsage.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    llmUsageCreateMany.mockResolvedValue({ count: 0 });
  });

  afterEach(() => {
    try {
      flushLlmUsage();
    } catch {
      // ignore
    }
  });

  it('buffers records without persisting immediately (non-blocking)', () => {
    recordLlmUsage({ ...baseRecord, purpose: 'intent', conversationId: 'c1' });
    // Not flushed yet (below the batch size).
    expect(llmUsageCreateMany).not.toHaveBeenCalled();
  });

  it('flushes buffered records on flushLlmUsage', () => {
    recordLlmUsage({ ...baseRecord, purpose: 'reply' });
    flushLlmUsage();
    expect(llmUsageCreateMany).toHaveBeenCalledTimes(1);
    const [args] = llmUsageCreateMany.mock.calls[0];
    expect(args.data).toHaveLength(1);
    expect(args.data[0]).toMatchObject({ purpose: 'reply', model: 'gemini-3.5-flash' });
  });

  it('flushes in batches respecting MAX_INSERT_BATCH and continues', () => {
    // Push more records than the flushLlmUsage batch size (200) to exercise
    // the recursive continuation. Record 250 entries.
    for (let i = 0; i < 250; i++) {
      recordLlmUsage({ ...baseRecord, promptTokens: i });
    }
    flushLlmUsage();
    // First flush takes a batch and recurses for the rest; total creates ==
    // number of batches (>1), and all 250 rows eventually persisted.
    const totalRows = llmUsageCreateMany.mock.calls.reduce(
      (sum, call) => sum + call[0].data.length,
      0,
    );
    expect(totalRows).toBe(250);
  });
});
