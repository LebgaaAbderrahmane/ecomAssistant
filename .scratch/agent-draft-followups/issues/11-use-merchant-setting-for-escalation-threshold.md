# Use the merchant setting for the escalation threshold

Status: needs-triage
Blocked by: issue 01, and the agent loading the merchant config

## What

Issue 01 hands over after N stalled Turns. N is a constant, 3.
The merchant already has a setting for this in the dashboard.
Nothing reads it.

## Idea

Take N from `AgentConfig.escalationThreshold`. Keep 3 as the fallback.

## Facts

- The column has default 3 (`back/prisma/schema.prisma:86`).
- The dashboard saves it (`front/src/pages/dashboard/Settings.tsx:115-161`).
- Nothing reads it (`docs/PROJECT_REPORT.md:66` and `:185`).
- The agent never loads `AgentConfig` (`docs/PROJECT_REPORT.md:79`). Tone, language and templates are also unused.
- `back` is the teammate's part. The agent must get the value from `back`.

## Open questions

- How does the agent get the value? A field in the gRPC request, or a tool?
- What if the merchant sets 0 or 1? We need a minimum.
- Does the hint text in the dashboard say the same as what N means here (stalled Turns in a row)?
- Do it together with the other unused config fields, or alone?
