# The internal tool name is shown to the customer

Status: fixed for the cancel reply (ticket `.scratch/order-flow-hardening/issues/02`, branch `fix/hide-tool-name`). Open: see below
Severity: minor

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

Reply: "Nous annulons l'étape en cours (createOrder)."

## Facts

- Likely from the cancel text (`CANCEL_STEP`, `cancel_step_input` gets the tool name).

## Still open (found while fixing the cancel reply)

- The `ask` LLM input (`drafts.ask`) has `"task_tool": "createOrder"`. The LLM can copy it into a question. Not seen in a real run yet. Not changed in ticket 02.
