# Resume a cut Turn with a Postgres checkpointer

Status: needs-triage

## What

If the agent dies in the middle of a Turn, the retry runs the whole Turn again.
It pays the LLM calls again. It also runs the tools again.
This is safe for `createOrder` (the idempotency key), but not free.

## Idea

Keep the LangGraph checkpointer in Postgres, not in RAM.
LangGraph then saves the graph state after every node.
After a crash, the agent continues from the last finished node and skips the nodes that are done.

## Why it matters

- **LLM cost.** One Turn can make up to 7 LLM calls (about 3.4K tokens in the evals). A rerun pays all of them again. The free Groq tier allows 8K tokens per minute and 200K per day.
- **Tools that have no key.** `cancelOrder` run twice says "already cancelled", and the customer gets the wrong reply (see issue 08).
- **RAM.** `InMemorySaver` (`ecom_agent/graph.py`) keeps every conversation in RAM and never cleans it. A Postgres checkpointer removes that.

## Facts

- The package is already installed: `langgraph-checkpoint-postgres` is in `requirements.txt`. `PostgresSaver` imports fine. No new dependency.
- The notes (the store) are already in Postgres. The checkpointer is a different thing and is still in RAM.
- A checkpoint is saved only when a node **finishes**. If the agent dies inside `calling_tool`, after `createOrder` returned, that node runs again. So the key is still needed. The checkpointer does not replace it.
- `thread_id` today is the whole conversation (`server.py`, `_run_turn`). `hydrate` resets the per-turn state at the start of each run.
- The Turn guard (`ecom_agent/turn_guard.py`) already gives one Turn at a time per conversation and a saved answer per message.
- Our own classes must be in the allowed list (`SERDE` in `graph.py`).

## Open questions

- How does the agent know that a run was cut and must be resumed, not started again?
- Is the `thread_id` still the conversation, or one thread per message?
- Is the cheaper idea enough: remove `InMemorySaver`, if the graph does not need it? The report already suggests this.
- Does a resumed run send the same reply text as the first try would have?
