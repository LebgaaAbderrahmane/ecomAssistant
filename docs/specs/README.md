# Specs

Design documents for the rework described in [../REWORK_PLAN.md](../REWORK_PLAN.md). Each spec is the acceptance bar for one track. Bugs and security findings stay in GitHub Issues; specs do not duplicate them.

| Spec | Track | Phase |
|---|---|---|
| [agent-turn.md](agent-turn.md) | One turn module, one session, one draft, 3 LLM calls | 2 |
| [tool-contract.md](tool-contract.md) | One generated catalog, 7 tools, typed gRPC | 2 |
| [backend-runtime.md](backend-runtime.md) | API/worker split, ordering, outbox, media, migrations | 3 |
| [ui-foundation.md](ui-foundation.md) | Tokens, primitives, shell, data layer, a11y, RTL | 4 |
| [ui-screens.md](ui-screens.md) | IA and screen-by-screen rework | 5 |
| [security-release.md](security-release.md) | P0 closure, CI, images, deploy, data protection | 1 |

Decisions are recorded in [../adr/](../adr/).

## How to use a spec

1. Read the problem section before proposing a solution; it names the cost being removed.
2. A PR that touches the track must satisfy the relevant acceptance criteria or explain which ones it defers and why.
3. If reality contradicts a spec, change the spec in the same PR. Do not let the document drift.
4. Metrics go in [../metrics/](../metrics/); link the run from the PR.
