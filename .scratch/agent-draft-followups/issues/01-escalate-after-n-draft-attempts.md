# Escalate after N failed draft attempts

Status: done (branch `feat/escalate-stalled-draft`, not merged yet)

## What

The agent counts `ToolCallDraft.attempts` but never checked it.
If the customer never gave a missing field, the agent asked for it again and again.

## Decisions

- N is a constant, `MAX_STALLED_TURNS = 3` in `ecom_agent/drafts.py`. The merchant setting is issue 11.
- One N for every tool.
- On the 3rd stalled Turn in a row, the agent hands over instead of asking again.
- The customer gets no message. This is the same as every Escalation today. See issue 10.
- The agent removes the Draft when it hands over, so it starts fresh when the human gives the chat back.
- Other Escalations keep the Draft as before.

## Facts

- The counter is set in `drafts.py::collect`. It goes back to 0 when a Turn makes progress.
- A Turn where the LLM fails also counts as stalled.
- `drafts.give_up` removes the Draft and gives the reason. `extract_tool_args` sets `escalation`. `after_extract` routes to `escalate`.
- The reason names the tool and the missing fields: `[stalledDraft] createOrder is stuck after 3 turns with nothing new. Missing: ...`
- No tests were added (the user asked for none).
