// One order per idempotency key. The agent sends the same key when it repeats a call,
// so a repeat gives back the first order and does not make a second one.
// No Prisma in this file: the caller passes the database steps, so it can be tested with fakes.

export type CreateStep<O, F> = { ok: true; order: O } | { ok: false; failure: F };

export type CreateOnceResult<O, F> =
  | { ok: true; order: O; created: boolean }
  | { ok: false; failure: F };

export interface CreateOnceDeps<O extends { id: string; status: string }, F> {
  // Returns the order that already has this key, or null. Without a key it always returns null.
  findExisting: () => Promise<O | null>;
  // Checks the input and writes the order, the customer and the conversation in one transaction.
  create: () => Promise<CreateStep<O, F>>;
  // True when the error says the key is taken (a parallel call won the race).
  isDuplicateError: (err: unknown) => boolean;
  // Adding the same order twice must do nothing (the queue job id is the order id).
  enqueue: (orderId: string) => Promise<void>;
}

export async function createOrderOnce<O extends { id: string; status: string }, F>(
  deps: CreateOnceDeps<O, F>,
): Promise<CreateOnceResult<O, F>> {
  const finish = async (order: O, created: boolean): Promise<CreateOnceResult<O, F>> => {
    // A first call may have died after it wrote the order and before it queued the confirmation.
    // Only an order that still waits needs the job.
    if (order.status === 'PENDING') {
      await deps.enqueue(order.id);
    }
    return { ok: true, order, created };
  };

  const existing = await deps.findExisting();
  if (existing) return finish(existing, false);

  let step: CreateStep<O, F>;
  try {
    step = await deps.create();
  } catch (err) {
    if (!deps.isDuplicateError(err)) throw err;
    const winner = await deps.findExisting();
    if (!winner) throw err;
    return finish(winner, false);
  }
  if (!step.ok) return step;
  return finish(step.order, true);
}
