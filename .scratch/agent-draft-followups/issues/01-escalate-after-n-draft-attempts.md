# Escalate after N failed draft attempts

Status: needs-triage
Blocked by: the draft module refactor (candidate 1 of the architecture review)

## What

The agent counts `ToolCallDraft.attempts` but never checks it.
If the customer never gives a missing field, the agent asks for it again and again.

## Idea

After N turns with no progress, hand the conversation to a human.
Use the escalation that already exists.

## Facts

- The counter is set in `ecom_agent/nodes/draft.py`, in `extract_tool_args`.
- It goes back to 0 when a turn makes progress.
- `docs/PROJECT_REPORT.md:63` already lists this gap.
- This is a feature. It changes what the agent does. It is not part of the refactor.

## Open questions

- What is N?
- Is N the same for every tool?
- What does the customer see before the hand-over?
