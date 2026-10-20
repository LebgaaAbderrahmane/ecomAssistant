# The agent asks to confirm an order that failed

Status: fixed (ticket `.scratch/order-flow-fixes/issues/01`). Prompt fix in the reply.
Severity: blocker

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

`createOrder` returned `success=False`, but the reply summed up the order and asked the customer to confirm.

## Facts

- Seen in Derdja: reply "هل تأكيد على هاد الطلب؟" right after `createOrder success=False`.
- Not checked yet in code: how `reply` reads a failed tool result.
