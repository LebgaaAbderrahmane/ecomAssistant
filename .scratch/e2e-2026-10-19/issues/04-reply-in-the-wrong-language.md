# Replies in the wrong language

Status: needs-triage
Severity: major

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

English lines to a French customer ("Got it! Could you let me know..."), with no rate limit. Spanish and English fallback texts during rate limits.

## Facts

- Related roadmap item: "Speak the customer's language".

## Seen again (re-run after the product fix, no rate limit)

- Log 20:17:22: "Sure! Could you please confirm..." (English) to a French message.
- Log 20:18:34: a reply in Arabic script to a French message.
