# The Draft loses fields after a failed createOrder

Status: needs-triage
Severity: major

Found in the real end-to-end test of 2026-10-19 (re-run after the product fix).

## What

`createOrder` failed (wrong commune). After the customer gave the right commune, the agent asked again for the quantity and the street, which were already given.

## Facts

- Log 20:20:54: `missing=['quantity', 'address']`.
- Likely cause (not checked in code): the Draft is closed when the tool runs, even when the tool fails, so a new empty Draft starts.
- Related: issue 03 (the agent asks to confirm an order that failed).
