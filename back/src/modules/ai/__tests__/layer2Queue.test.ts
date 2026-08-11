import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cancelPendingLayer2JobsFrom } from '../../../queues/layer2.cancel';
import type { PendingLayer2Job, PendingLayer2JobSource } from '../../../queues/layer2.cancel';

const makeJob = (conversationId: string, messageId: string): PendingLayer2Job => ({
  data: { conversationId, messageId },
  remove: async () => {},
});

describe('cancelPendingLayer2Jobs', () => {
  it('removes only jobs matching the conversation id and returns the count', async (t) => {
    const removed: PendingLayer2Job[] = [];
    const jobs: PendingLayer2Job[] = [
      makeJob('conv-1', 'm1'),
      makeJob('conv-2', 'm2'),
      makeJob('conv-1', 'm3'),
    ];
    const queue: PendingLayer2JobSource = {
      getJobs: async () => jobs,
    };
    const getJobsMock = t.mock.method(queue, 'getJobs');
    for (const job of jobs) {
      t.mock.method(job, 'remove', async () => {
        removed.push(job);
      });
    }

    const count = await cancelPendingLayer2JobsFrom('conv-1', queue);

    assert.equal(count, 2);
    assert.deepEqual(removed.map((j) => j.data.messageId), ['m1', 'm3']);
    assert.equal(getJobsMock.mock.calls.length, 1);
  });

  it('returns 0 when no pending jobs belong to the conversation', async (t) => {
    const jobs = [makeJob('other-conv', 'm9')];
    const queue: PendingLayer2JobSource = {
      getJobs: async () => jobs,
    };
    t.mock.method(jobs[0], 'remove', async () => {});

    const count = await cancelPendingLayer2JobsFrom('conv-1', queue);

    assert.equal(count, 0);
  });

  it('returns 0 when the queue has no pending jobs', async (t) => {
    const queue: PendingLayer2JobSource = {
      getJobs: async () => [],
    };
    t.mock.method(queue, 'getJobs');

    const count = await cancelPendingLayer2JobsFrom('conv-1', queue);

    assert.equal(count, 0);
  });
});
