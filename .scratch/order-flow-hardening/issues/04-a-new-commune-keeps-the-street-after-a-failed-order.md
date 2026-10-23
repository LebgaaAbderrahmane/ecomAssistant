# 04: A new commune keeps the street after a failed order

**What to build:** the order failed (for example back does not know the commune). The customer fixes only the commune, in the same wilaya. The order is sent again with the same street, with no extra question. The customer typed this street seconds ago, in this same order.

Limits:
- Only when the Draft is waiting for a fix (it has an error) and the wilaya stays the same.
- A new wilaya still drops the street (the address rule from PR #51), because the street is probably different too.
- A new street in the message always wins.
- Without a failed order, a new commune still drops the street, as today.

Decision (user, 2026-10-23): keep the street silently, no extra question. The street is not shown in the order confirmation, and `modifyOrder` cannot change it. That is a separate issue for `back` (`.scratch/agent-draft-followups/issues/12-show-street-in-confirmation-and-modify-it.md`).

A test from PR #53 says the agent asks for the street again in this case (`test_a_new_commune_after_a_failed_order_asks_the_street_again`). It must be turned around, and the other tests of the address rule must stay green.

Branch: `fix/keep-street-after-failed-order`, from `dev`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Failed order, then a new commune in the same wilaya: `createOrder` runs again with the same street and no street question
- [ ] Failed order, then a new wilaya: the street is asked again
- [ ] No failed order, then a new commune: the street is asked again (PR #51 unchanged)
- [ ] The turned-around test and the new tests pass
