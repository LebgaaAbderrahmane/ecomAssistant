# The order loses the chosen product

Status: fixed, not committed (branch `fix/order-product-id`). One selected product per conversation; a list is not a choice; cleared after an order.
Severity: blocker

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

The customer names a product. The agent asks for the "product ID" again and again and never creates the order.

## Facts

- `flow_resolver` opened a new flow for the order. The chosen product stayed in the old flow, so the args LLM got `selected_product = None`.
- No code copied the product id into the Draft. It worked only when the LLM copied it.
- The LLM sometimes wrote the name (`'Hydrogen'`) as `productId`. `back` rejected it.
- Fix (v2): one selected product per conversation; a list of several products selects nothing; the selection is cleared after an order is created. `drafts.py` drops a productId that was never shown, fills it from the selected product, and asks "which product" by name. No name matching in code.
