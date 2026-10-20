# query_tool fills arguments the customer did not give

Status: needs-triage
Severity: minor

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

`query_tool` picked `createOrder` with `quantity: 1, wilaya: Oran` before the customer said them. Today these args are thrown away, so no harm yet.
