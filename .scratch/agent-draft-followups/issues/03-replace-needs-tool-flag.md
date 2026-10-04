# Replace the needs_tool flag with a clearer field

Status: needs-triage

## What

`needs_tool` is read or written in 7 files: `check`, `query`, `calling`, `draft`, `reply`, `memory` and `routing`.
`reply` uses it to choose where the reply text comes from:
the tool output, or the text another node already wrote.
The name `needs_tool` does not say that.

## Idea

Use a field that says where the reply text comes from.

## Facts

- `AgentState.needs_tool` is in `ecom_agent/models/state.py`.
- It has two jobs: "this message needs a tool" (set by `check_llm`) and "write the reply from the tool output" (set by `calling_tool`).
- `ask_reply` and the cancel branch of `draft_gate` set it to `False` to steer `reply`.
- It was found during the draft refactor review. The draft module cannot fix it alone.

## Open questions

- One field or two?
- What are the clear names?
