# M8 — Wire AgentService.ProcessMessage to the LangGraph agent

## Root cause
`ecom_agent/server.py::ProcessMessage` (lines 73-80) still returns the hardcoded
French echo stub (`"Bonjour, vous avez écrit : « … »…"`) and never runs the
compiled LangGraph `app` (graph.py). `agentBridgeCore.ts` (back) forwards
whatever `DECISION_REPLY` text the agent returns, so every real WhatsApp message
gets the placeholder. The graph was proven in `/tmp/opencode/m7_live_full.py`
via `app.invoke` but was never connected to the gRPC server.

## Decision (user-approved)
On LLM failure / graph error → return `DECISION_ESCALATE` so the back hands the
conversation to a human (no placeholder).

## Implementation — edit `ecom_agent/server.py` only (no back changes)

1. Imports: add
   - `from langchain_core.messages import HumanMessage`
   - `from graph import app`
   - `from tools.grpc import tool_identity`
2. Add helper `_last_reply(state) -> str` — returns the last `type == "ai"`
   message content (handles str / list-of-content-dicts). Empty string when the
   turn ended via the `escalate` node (escalate adds no AI message).
3. Rewrite `ProcessMessage` body after the existing text/agent_context logging:
   ```python
   if role != "customer" or not text:
       return ProcessMessageResponse(decision=DECISION_REPLY,
                                     text="Bonjour, comment puis-je vous aider ?")

   config = {"configurable": {"thread_id": request.conversation_id,
                              "store_key": request.conversation_id}}
   try:
       with tool_identity(conversation_id=request.conversation_id,
                          merchant_id=request.merchant_id,
                          customer_id=request.customer_id):
           state = app.invoke({"messages": [HumanMessage(content=text)]}, config=config)
   except Exception as exc:
       log.error("agent graph failed for message=%s: %s", request.message_id, exc, exc_info=True)
       return ProcessMessageResponse(decision=DECISION_ESCALATE)

   reply_text = _last_reply(state)
   if reply_text.strip():
       return ProcessMessageResponse(decision=DECISION_REPLY, text=reply_text)
   return ProcessMessageResponse(decision=DECISION_ESCALATE)
   ```
   Keep `Health` + auth/message_id guards unchanged. `tool_identity` wraps the
   invoke so tools authenticate for the right conversation on the back
   (same pattern as m7_live_full.py).

## Verification
1. `python -m py_compile ecom_agent/server.py`
2. `docker compose build agent && docker compose up -d agent` (image-only; no
   bind mount), wait healthy.
3. Add `/tmp/opencode/m8_processmessage_e2e.py`: psycopg fixtures
   (merchant/customer/conversation/product + one customer Message row), then a
   direct gRPC `AgentService.ProcessMessage` call to `127.0.0.1:50052` with
   `Bearer INTERNAL_API_KEY`; assert decision is REPLY *and* reply text does NOT
   start with "Bonjour, vous avez écrit" (or decision is ESCALATE + conversation
   taken over when Gemini is quota-limited). Copy into agent container and run.
4. `docker compose exec back npm run grpc:check` — all channels OK (ProcessMessage
   happy path now graph-driven).
5. Copy + run `m7_live_full.py` in agent container — full-graph search→order
   over real gRPC/DB still green.
6. `docker compose exec back ./node_modules/.bin/tsx scripts/e2e-message.ts` —
   reply content is now a real assistant message, not the stub. (Note: if Gemini
   429s, turns escalate → OUT reply assertions may fail; grace note in report.)