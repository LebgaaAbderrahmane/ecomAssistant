# French "la" cancels the Draft

Status: needs-triage
Severity: blocker

Found while writing tests for issue 01 (2026-10-19).

## What

`CANCEL_RE` (`ecom_agent/text/patterns.py`) has `la`, for Derdja "no". In French, "la" means "the".
A French customer who writes "la Montre Casio" or "je veux la rouge" while an order is open gets the order cancelled.

## Facts

- `drafts._direction` checks `CANCEL_RE` first, before any LLM, so the cancel is certain.
- Seen in a test: "la Casio" made the `cancel` LLM call and removed the Draft.
- Idea from before: cancel only when the whole message is "la".
