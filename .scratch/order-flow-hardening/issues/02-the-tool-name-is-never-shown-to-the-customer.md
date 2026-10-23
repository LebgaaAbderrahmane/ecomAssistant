# 02: The tool name is never shown to the customer

**What to build:** the reply when the customer cancels an order never says the tool name. Today it says "Nous annulons l'étape en cours (createOrder)." The reply talks about "your order" in the customer's language.

Likely cause: the cancel text input carries the tool name (`CANCEL_STEP`, `cancel_step_input`). Check it first.

From: e2e bug 06 (`.scratch/e2e-2026-10-19/issues/06-internal-tool-name-shown.md`).

Branch: `fix/hide-tool-name`, from `dev`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] The cancel reply has no tool name (`createOrder`, `searchProducts`...)
- [ ] The LLM still gets what it needs to know what is cancelled (an order)
- [ ] A test checks the text sent to the LLM has no tool name; golden files are regenerated only for this reason
