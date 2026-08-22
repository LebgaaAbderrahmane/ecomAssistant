import { describe, it, expect, vi } from 'vitest';
import { cancelPendingLayer2JobsFrom } from '../../../queues/layer2.cancel';
import type { PendingLayer2Job, PendingLayer2JobSource } from '../../../queues/layer2.cancel';

const makeJob = (conversationId: string, messageId: string): PendingLayer2Job => ({
  data: { conversationId, messageId },
  remove: async () => {},
});

describe('cancelPendingLayer2Jobs', () => {
  it('removes only jobs matching the conversation id and returns the count', async () => {
    const removed: PendingLayer2Job[] = [];
    const jobs: PendingLayer2Job[] = [
      makeJob('conv-1', 'm1'),
      makeJob('conv-2', 'm2'),
      makeJob('conv-1', 'm3'),
    ];
    for (const job of jobs) {
      job.remove = vi.fn(async () => { removed.push(job); });
    }
    const queue: PendingLayer2JobSource = {
      getJobs: vi.fn(async () => jobs),
    };

    const count = await cancelPendingLayer2JobsFrom('conv-1', queue);

    expect(count).toBe(2);
    expect(removed.map((j) => j.data.messageId)).toEqual(['m1', 'm3']);
    expect(queue.getJobs).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when no pending jobs belong to the conversation', async () => {
    const jobs = [makeJob('other-conv', 'm9')];
    jobs[0].remove = vi.fn(async () => {});
    const queue: PendingLayer2JobSource = {
      getJobs: vi.fn(async () => jobs),
    };

    const count = await cancelPendingLayer2JobsFrom('conv-1', queue);

    expect(count).toBe(0);
  });

  it('returns 0 when the queue has no pending jobs', async () => {
    const queue: PendingLayer2JobSource = {
      getJobs: vi.fn(async () => []),
    };

    const count = await cancelPendingLayer2JobsFrom('conv-1', queue);

    expect(count).toBe(0);
  });
});
