# One session and one active draft per conversation

The agent stores conversation state as a list of `Flow` objects. Each flow has an id, a `FlowState`, product discovery, order context, and one draft. A `flow_resolver` LLM call decides whether to create, continue, or clarify a flow.

The product does not need this. A customer talks about one thing at a time and has at most one open order. A side question does not create a second flow; it is answered and the draft stays. Modeling that as a list adds ids, states, routing branches, and a model call without adding a user-visible capability.

We replace it with one session object per conversation: one nullable `activeDraft`, the selected product, the shown products, the delivery address, the last tool result, and the language. The session is one JSONB row in Postgres.

## Considered options

- **Keep flows, remove the resolver.** Cheaper, but the list still needs ids and routing, and the UI would eventually expose a "flows" concept nobody asked for.
- **Keep flows for multi-order conversations.** There is no product requirement for two simultaneous orders. If it appears, it can be modeled explicitly later.
- **One session, one draft.** Chosen.

## Consequences

- `flows.py`, `nodes/flow.py`, `flow_resolver`, `Flow`, `FlowState`, `flow_id`, and `active_flow_id` are deleted.
- Finished drafts are not kept as history. The order is the history; a `turn_log` row can provide audit.
- The session row needs a `version` field so stored rows can be migrated.
- A side question must be handled by a rule (answer, keep draft), not by a new flow.
