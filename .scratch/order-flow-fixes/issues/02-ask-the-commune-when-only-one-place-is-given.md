# 02: Ask the commune when only one place name is given

**What to build:** when the customer gives only one place name ("Oran"), the agent fills only the wilaya and asks for the commune. Today the args LLM puts "Oran" in both fields, so the commune is never asked and back rejects the order.

A commune can have the same name as its wilaya (Oran in Oran, Blida in Blida). That is fine when the customer says it twice ("Oran, Oran") or clearly names the commune. So "commune equals wilaya" is not an error by itself. The rule is: one place name in the message fills only the wilaya.

From: e2e bug 12 (`.scratch/e2e-2026-10-19/issues/12-commune-filled-with-the-wilaya-name.md`).

**Blocked by:** None (can start immediately)

**Status:** partly done (see notes/order-flow-fixes-summary.md)

- [ ] "Oran" alone fills the wilaya only, and the agent asks for the commune
- [ ] "Oran, Bir El Djir" fills both
- [ ] "Oran, Oran" (or "commune Oran") fills both with Oran
- [ ] A test (scripted LLM) covers the one-name case
