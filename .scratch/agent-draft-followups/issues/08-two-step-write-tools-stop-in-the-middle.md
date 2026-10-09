# Two-step write tools can stop in the middle

Status: needs-triage

I found this by reading the code. I did not run it. It may be a bug.

## What

Four tools in `back/src/modules/ai/tools/registry.ts` write in two steps with no transaction.
If the process stops after the first step, the second step is never done.
A retry may not repair it.

`createOrder` had the same problem. It now uses one transaction (see `docs/adr/0001-one-order-per-customer-message.md`).

## Facts, tool by tool

- `cancelOrder`: sets the order to `CANCELLED`, then updates the conversation state.
  - **Can get stuck.** A retry finds the order already cancelled, returns "Order is already cancelled", and never updates the conversation.
- `escalateConversation`: sets `takenOverByHuman`, then creates a notification.
  - **Can get stuck.** A retry sees `takenOverByHuman` and returns `escalated: false`. The notification is never created, so the merchant is not told.
  - The notification error is caught and only logged, on purpose: the takeover must happen even if the notification fails. A transaction around both steps would change this rule.
- `confirmOrder`: sets the order to `CONFIRMED`, then updates the conversation state.
  - **Repairs itself.** It has no status check, so a retry runs both writes again.
- `modifyOrder`: updates the order, then the customer address.
  - **Repairs itself.** The order stays `PENDING`, so a retry runs both writes again.

## Idea

- `cancelOrder`: put both writes in one transaction. Or, when the order is already cancelled, still update the conversation state.
- `escalateConversation`: do not wrap it blindly. Decide first what should happen when the notification cannot be saved.
- `confirmOrder` and `modifyOrder`: a transaction is clean, but not urgent.

## Open questions

- For `escalateConversation`, is "takeover even if the notification fails" still the rule?
- Do we want one small helper for "write the order and the conversation together", used by `createOrder`, `cancelOrder` and `confirmOrder`?
