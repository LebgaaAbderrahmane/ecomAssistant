# One Turn module for the server and the evals

Status: needs-triage
Do after: make a Turn safe to retry (`turn_guard.py`)

## What

Production and the evals decide "reply or escalate" with different rules.
Production: an empty reply text means escalate.
Evals: they read `state.escalation` and the draft state.
The evaluator `server_sends_right_thing` exists only to catch when the two disagree.

## Idea

One module runs a Turn and returns the decision and the text.
`server.py` and the evals both call it.
`turn_guard.py` (lock and saved results) moves into it.

## Facts

- This is candidate 2 of the architecture review (`~/Documents/projects/ecomAssistant/reports/2026-10-02-architecture-review.html`).
- Commit `8e3211e` fixed a bug at exactly this place: an old reply was sent again on an escalation turn.
- `evals/target.py` imports the private `_last_reply` from `server.py`.
- We chose to keep `turn_guard.py` small first, and do this after.

## Open questions

- Does the Turn module also own the `message_id` check, or only call `turn_guard.py`?
- What does the evals runner do about the lock and the saved results?
