# 03: Nothing is shown as selected after a search

**What to build:** after a search, the query LLM no longer sees the first result as the "selected" product. The product fix (PR #52) removed that idea everywhere else: a list of products is not a choice. The old lines in `_flow_context` (`nodes/query.py`) still show `tool_results[0]` as selected. It can push the agent toward the wrong product.

Small change: remove those lines. The query LLM sees `selected_product` only when the customer really chose one.

Branch: `fix/query-no-first-result`, from `dev`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] After a search with 2 or more results, the flow context for the query LLM has `selected_product: null`
- [ ] After the customer picks a product, it is shown as selected
- [ ] A test covers both
