# A number in the street becomes the quantity

Status: fixed (ticket `.scratch/order-flow-fixes/issues/03`). Prompt fix.
Severity: blocker

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

"Cité 200 logements" gave `quantity: 200` (Derdja). In French, the street became "Cité logements" (the 200 was dropped).

## Facts

- Args LLM log (Derdja): `extracted={'quantity': 200, 'address': 'Cité 200 logements'}`.
- Args LLM log (French): `extracted={'address': 'Cité logements'}`.
- Many Algerian addresses have numbers ("Cité 1000 logts").
