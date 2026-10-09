import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderOnce, type CreateOnceDeps } from '../tools/createOrderOnce';

type FakeOrder = { id: string; status: string };

// A tiny in-memory "database": the orders by key.
const makeDeps = (
  db: Map<string, FakeOrder>,
  key: string | null,
  overrides: Partial<CreateOnceDeps<FakeOrder, string>> = {},
) => {
  const enqueued: string[] = [];
  let creates = 0;
  const deps: CreateOnceDeps<FakeOrder, string> = {
    findExisting: async () => (key ? (db.get(key) ?? null) : null),
    create: async () => {
      creates++;
      const order = { id: `order-${creates}`, status: 'PENDING' };
      if (key) db.set(key, order);
      return { ok: true, order };
    },
    isDuplicateError: (err) => err instanceof Error && err.message === 'duplicate',
    enqueue: async (orderId) => {
      enqueued.push(orderId);
    },
    ...overrides,
  };
  return { deps, enqueued, creates: () => creates };
};

describe('createOrderOnce', () => {
  it('the same key twice makes one order and returns the first one', async () => {
    const db = new Map<string, FakeOrder>();
    const first = makeDeps(db, 'AGENT-m1');
    const second = makeDeps(db, 'AGENT-m1');

    const a = await createOrderOnce(first.deps);
    const b = await createOrderOnce(second.deps);

    assert.ok(a.ok && b.ok);
    assert.equal(a.order.id, b.order.id);
    assert.equal(a.created, true);
    assert.equal(b.created, false);
    assert.equal(first.creates() + second.creates(), 1);
  });

  it('the repeat does not run the checks of create again', async () => {
    const db = new Map<string, FakeOrder>([['AGENT-m1', { id: 'order-1', status: 'PENDING' }]]);
    const { deps } = makeDeps(db, 'AGENT-m1', {
      create: async () => {
        throw new Error('create must not run');
      },
    });

    const result = await createOrderOnce(deps);

    assert.ok(result.ok);
    assert.equal(result.order.id, 'order-1');
  });

  it('a repeat queues the confirmation job again, in case the first call died before it', async () => {
    const db = new Map<string, FakeOrder>([['AGENT-m1', { id: 'order-1', status: 'PENDING' }]]);
    const { deps, enqueued } = makeDeps(db, 'AGENT-m1');

    await createOrderOnce(deps);

    assert.deepEqual(enqueued, ['order-1']);
  });

  it('an order that is not pending gets no new confirmation job', async () => {
    const db = new Map<string, FakeOrder>([['AGENT-m1', { id: 'order-1', status: 'CONFIRMED' }]]);
    const { deps, enqueued } = makeDeps(db, 'AGENT-m1');

    const result = await createOrderOnce(deps);

    assert.ok(result.ok);
    assert.deepEqual(enqueued, []);
  });

  it('without a key every call makes its own order', async () => {
    const db = new Map<string, FakeOrder>();
    const one = makeDeps(db, null);
    const two = makeDeps(db, null);

    const a = await createOrderOnce(one.deps);
    const b = await createOrderOnce(two.deps);

    assert.ok(a.ok && b.ok);
    assert.equal(one.creates() + two.creates(), 2);
  });

  it('a failed check is returned as it is and nothing is queued', async () => {
    const db = new Map<string, FakeOrder>();
    const { deps, enqueued } = makeDeps(db, 'AGENT-m1', {
      create: async () => ({ ok: false, failure: 'out of stock' }),
    });

    const result = await createOrderOnce(deps);

    assert.deepEqual(result, { ok: false, failure: 'out of stock' });
    assert.deepEqual(enqueued, []);
  });

  it('when a parallel call wins the race, the loser returns the winner order', async () => {
    const db = new Map<string, FakeOrder>();
    let lookups = 0;
    const { deps, enqueued } = makeDeps(db, 'AGENT-m1', {
      findExisting: async () => {
        lookups++;
        // The first look finds nothing. After the failed create, the winner is there.
        return lookups === 1 ? null : { id: 'winner', status: 'PENDING' };
      },
      create: async () => {
        throw new Error('duplicate');
      },
    });

    const result = await createOrderOnce(deps);

    assert.ok(result.ok);
    assert.equal(result.order.id, 'winner');
    assert.equal(result.created, false);
    assert.deepEqual(enqueued, ['winner']);
  });

  it('another error is not hidden', async () => {
    const db = new Map<string, FakeOrder>();
    const { deps } = makeDeps(db, 'AGENT-m1', {
      create: async () => {
        throw new Error('database is down');
      },
    });

    await assert.rejects(() => createOrderOnce(deps), /database is down/);
  });
});
