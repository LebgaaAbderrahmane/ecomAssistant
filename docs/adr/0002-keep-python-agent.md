# Keep the agent in Python and simplify inside it

The agent is a Python service using LangGraph. A proposal to rewrite it in TypeScript was considered, because two languages and two package managers cost the team context and CI time.

We keep Python for this rework. The expensive part is the orchestration, not the language: 11 nodes, up to 7 LLM calls, and multi-flow state. That can be removed inside Python. The eval suite is Python and is the safety net for the change; a rewrite would invalidate it at the same time as the behavior changes. `back` keeps owning business logic and tools, so the boundary does not move.

## Considered options

- **Rewrite in TypeScript.** One language, one runtime, shared types. Rejected for now: it combines a language migration with a behavior rewrite, and throws away the evals. Revisit only if the team becomes TS-only and the agent stops needing Python-specific libraries.
- **Keep Python and keep the graph.** Lowest short-term risk, but leaves the main complexity in place.
- **Keep Python, replace the graph with one turn module.** Chosen. Smallest change that removes the real cost.

## Consequences

- Two runtimes remain: Node for `back`/`front`, Python for the agent. CI must run both.
- The gRPC boundary stays, so the contract work in ADR 0004 is required.
- The eval suite becomes the gate for every agent PR.
- A future TS rewrite is not blocked; it is simply not part of this program.
