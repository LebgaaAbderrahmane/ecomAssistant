# 01: A failed order can be fixed by the customer

**What to build:** when `createOrder` fails, the customer does not lose what they already gave. The agent keeps the Draft (product, quantity, wilaya, commune, street). It tells the customer what failed, in their language, using back's error text. For example: "We could not find the commune Oran. Which commune?" It never sums up the order or asks to confirm it, because no order exists. The customer answers with the fix. The new value replaces the wrong one, and the order is sent again.

back's error is plain text (for example `Baladia "Oran" makanach...`). It does not name the wrong field. So the agent does not try to guess and delete the wrong field. It keeps all the fields, and the customer's answer replaces the wrong value.

A successful order works as today: the Draft is closed and the selected product is cleared. A failed order keeps the selected product (already true).

From: e2e bugs 13 and 03 (`.scratch/e2e-2026-10-19/issues/`).

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] After a failed `createOrder`, the Draft still has every field the customer gave
- [ ] The reply says the order failed and why. It does not ask to confirm the order
- [ ] The customer's next message ("Bir El Djir") replaces the wrong value, and `createOrder` runs again without asking for the other fields
- [ ] A successful order still closes the Draft
- [ ] A test (scripted LLM, fake shop) covers: fail, then fix, then order created
