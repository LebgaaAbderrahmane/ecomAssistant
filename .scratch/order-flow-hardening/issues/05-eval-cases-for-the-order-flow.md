# 05: Eval cases for the order flow

**What to build:** new cases in the eval dataset (`evals/dataset.py`, real LLM, fake shop) that catch the order-flow bugs of the e2e test of 2026-10-19:
- "la" in a French sentence does not cancel the order
- a street with a number ("Cité 200 logements") stays the street, and the quantity is right
- one place name fills only the wilaya
- a failed order, then the fix, ends with an order
- a product picked by name gets the real product id
- a second order to a new commune asks for the street

The evals run as a LangSmith experiment, and the monthly trace limit is reached. So add a small `--local` mode to `evals.run`: it runs the cases and prints pass or fail with no LangSmith.

The user has an uncommitted edit in `evals/dataset.py` (case 14). Stage only the new lines, never that edit.

Branch: `fix/order-flow-evals`, from `dev`.

**Blocked by:** 01, 02, 03, 04

**Status:** ready-for-agent

- [ ] The new cases are in the dataset
- [ ] `python -m evals.selfcheck` stays green (no LLM)
- [ ] `python -m evals.run --local` runs the cases with the real LLM and prints pass or fail per case
- [ ] The docs line in `docs/architecture.md` (section 12.5) mentions `--local`
