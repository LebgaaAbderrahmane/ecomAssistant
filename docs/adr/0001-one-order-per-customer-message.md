# One order per customer message

`back` sends the same message to the agent again when a call fails, and a Turn can die after `createOrder` has run. To stop a second order, the agent sends the message id as an idempotency key with every tool call. `createOrder` builds `platformOrderId` from it (`AGENT-<message id>`). The existing unique index on `(merchantId, platformOrderId)` then makes a repeated call return the first order.

## Considered options

- **Escalate to a human when a retry finds a Turn that did not finish.** Safe, but a human must step in after every crash.
- **Run the Turn again with no key.** It can make two orders. A COD order ships a real parcel.
- **A new `idempotencyKey` column on `Order`.** It works the same way, but it needs a schema change for no gain. The platform order id already has a unique index.

## Consequences

- One customer message makes at most one order.
- Orders made by the agent have a `platformOrderId` that starts with `AGENT-`, not `FAKE-`.
- The other write tools (`cancelOrder`, `modifyOrder`, `confirmOrder`) do not use the key. Repeating them does not make a second order.
- The key is a field of the gRPC contract (`ExecuteToolRequest.idempotency_key`). Removing it later is a contract change.
