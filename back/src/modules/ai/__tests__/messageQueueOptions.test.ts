import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MESSAGE_JOB_ATTEMPTS,
  MESSAGE_JOB_BACKOFF,
  MESSAGE_JOB_REMOVE_ON_COMPLETE,
  MESSAGE_JOB_REMOVE_ON_FAIL,
} from '../../../queues/messageQueueOptions';

describe('message queue retry policy (agent-down error path)', () => {
  it('failing jobs retry exponentially up to 5 attempts before being marked failed', () => {
    assert.equal(MESSAGE_JOB_ATTEMPTS, 5);
    assert.equal(MESSAGE_JOB_BACKOFF.type, 'exponential');
    assert.equal(MESSAGE_JOB_BACKOFF.delay, 1000);
  });

  it('completed and failed jobs are bounded in the queue', () => {
    assert.equal(MESSAGE_JOB_REMOVE_ON_COMPLETE, 1000);
    assert.equal(MESSAGE_JOB_REMOVE_ON_FAIL, 5000);
  });
});