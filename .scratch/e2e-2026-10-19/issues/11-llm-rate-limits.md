# Free LLM tiers break normal chat speed

Status: needs-triage
Severity: major

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

Groq free tier is 8K tokens per minute. One Turn uses up to about 3.5K tokens. Gemini free tier is 5 requests per minute. Two quick messages can fail.
