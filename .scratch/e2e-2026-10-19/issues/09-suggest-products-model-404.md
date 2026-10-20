# suggestProducts fails: gemini-2.5-flash returns 404 (back)

Status: needs-triage
Severity: major

Found in the real end-to-end test of 2026-10-19 (`notes/e2e-report-2026-10-19.md`).

## What

`back` calls `gemini-2.5-flash` for `suggestProducts`. Google returns 404. The model name is in `docker-compose.yml`. Teammate's part.
