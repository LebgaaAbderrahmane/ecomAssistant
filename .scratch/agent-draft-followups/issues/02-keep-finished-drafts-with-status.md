# Keep finished drafts with a status

Status: needs-triage
Blocked by: the draft module refactor (candidate 1 of the architecture review)

## What

Today a finished draft is removed (`flow.tool_draft = None`).
The model has the statuses `executed` and `cancelled`, but no code sets them.
The refactor removes these two statuses.

## Idea

Keep finished drafts in the Flow and mark them `executed` or `cancelled`.

## Facts

- Statuses are defined in `ecom_agent/models/domain.py`.
- `docs/architecture.md` section 6.4 lists the four statuses.
- The saved notes in Postgres hold only `drafting` or `ready` today.
- This is a behavior change. It needs its own decision.

## Open questions

- Who would read the old drafts: the agent, the evals, or the dashboard?
- How many old drafts do we keep in the saved notes?
