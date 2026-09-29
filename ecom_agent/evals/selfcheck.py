"""No-LLM checks for the eval code. Run: python -m evals.selfcheck"""
import json

from evals import fake_tools
from nodes.calling import _tool_result_products


def check_fake_tools() -> None:
    fake_tools.reset()
    found = json.loads(fake_tools.fake_call_tool("searchProducts", {"product": "nike air max"}))
    assert [p["id"] for p in found["products"]] == ["p1"], found

    montre = json.loads(fake_tools.fake_call_tool("searchProducts", {"product": "montres"}))
    assert [p["id"] for p in montre["products"]] == ["p2"], montre

    missing = json.loads(fake_tools.fake_call_tool("searchProducts", {"product": "iPhone 15"}))
    assert missing["outcome"] == 2 and missing["error"], missing

    # The agent must be able to read our product JSON, or buy flows break for a fake reason.
    products = _tool_result_products(json.dumps(found))
    assert products and products[0].product_id == "p1" and products[0].price == 12000, products

    ship = json.loads(fake_tools.fake_call_tool("calculateShipping", {"wilaya": "Oran"}))
    assert ship == {"wilaya": "Oran", "cost": 600}, ship

    assert [c["name"] for c in fake_tools.calls] == ["searchProducts"] * 3 + ["calculateShipping"]
    fake_tools.reset()
    assert fake_tools.calls == []


def check_install() -> None:
    import tools.registry
    from tools import searchProducts

    fake_tools.install()
    fake_tools.reset()
    out = json.loads(searchProducts.invoke({"product": "hoodie"}))
    assert out["products"][0]["id"] == "p3", out
    assert fake_tools.calls == [{"name": "searchProducts", "args": {"product": "hoodie"}}]
    assert tools.registry.call_tool is fake_tools.fake_call_tool


def check_last_turn_reply() -> None:
    from langchain_core.messages import AIMessage, HumanMessage
    from evals.target import last_turn_reply

    turn1 = [HumanMessage("salam"), AIMessage("Salam! Kifach n3awnek?")]
    assert last_turn_reply(turn1) == "Salam! Kifach n3awnek?"
    # Turn 2 escalated: no AI message after the last human one, so no reply.
    assert last_turn_reply([*turn1, HumanMessage("je veux un remboursement")]) == ""
    # The empty tool-call AIMessage from calling_tool is skipped.
    tool_turn = [HumanMessage("x"), AIMessage(""), AIMessage("done")]
    assert last_turn_reply(tool_turn) == "done"


def check_outcome_of() -> None:
    from datetime import datetime, timezone
    from evals.target import outcome_of
    from models.conversation import ConversationMemory
    from models.domain import Flow, FlowState, ToolCallDraft
    from models.state import AgentState

    now = datetime.now(timezone.utc)
    flow = Flow(flow_id="f1", state=FlowState.ORDER, created_at=now, updated_at=now,
                tool_draft=ToolCallDraft(tool_name="createOrder", missing=["wilaya"]))
    mem = ConversationMemory(flows=[flow], active_flow_id="f1")
    assert outcome_of(AgentState(messages=[], escalation=True)) == "escalate"
    assert outcome_of(AgentState(messages=[], conversation_memory=mem)) == "ask_info"
    assert outcome_of(AgentState(messages=[])) == "reply"


def check_evaluators() -> None:
    from evals.evaluators import (
        correct_args, correct_outcome, correct_tool, llm_clean, server_sends_right_thing,
    )

    out = {
        "tools_called": [{"name": "calculateShipping", "args": {"wilaya": " Oran "}}],
        "outcome": "reply", "reply": "600 DA", "server_reply": "600 DA", "llm_failures": 0,
    }
    ref = {"outcome": "reply", "expected_tools": ["calculateShipping"], "expected_args": {"wilaya": "oran"}}
    for ev in (correct_outcome, correct_tool, correct_args, server_sends_right_thing, llm_clean):
        assert ev(outputs=out, reference_outputs=ref)["score"] == 1, ev.__name__

    assert correct_args(outputs=out, reference_outputs={**ref, "expected_args": {}})["score"] is None
    assert correct_args(outputs=out, reference_outputs={**ref, "expected_args": {"wilaya": "alger"}})["score"] == 0
    assert correct_tool(outputs={**out, "tools_called": []}, reference_outputs={**ref, "expected_tools": []})["score"] == 1
    assert correct_tool(outputs=out, reference_outputs={**ref, "expected_tools": []})["score"] == 0

    # Stale reply bug: agent escalated, but the server would still send an old text.
    stale = {**out, "outcome": "escalate", "server_reply": "Salam!"}
    assert server_sends_right_thing(outputs=stale, reference_outputs={**ref, "outcome": "escalate"})["score"] == 0
    assert llm_clean(outputs={**out, "llm_failures": 2}, reference_outputs=ref)["score"] == 0


def check_llm_failure_counter() -> None:
    import logging
    from evals import target

    class _StubApp:
        def invoke(self, inp: dict, config: dict) -> dict:
            logging.getLogger("llm.client").warning("LLM provider 'groq' failed: 429")
            return {"messages": inp["messages"]}

    real_app = target.app
    target.app = _StubApp()
    try:
        assert target.run_conversation({"turns": ["x"]})["llm_failures"] == 1
    finally:
        target.app = real_app


def check_fake_backend() -> None:
    from evals import fake_backend

    fake_backend.start({"has_order": True, "messages": ["template", {"sender": "merchant", "text": "hi"}]})
    fake_backend.add("customer", "chhal total?")
    ctx = fake_backend.fake_get_conversation_context(limit=2)
    assert ctx.current_order and ctx.current_order.total_amount == 12600, ctx
    assert [(m.sender, m.text) for m in ctx.messages] == [("merchant", "hi"), ("customer", "chhal total?")]
    history = ctx.chat_history()
    assert [m.type for m in history] == ["ai", "human"] and history[0].content == "[merchant] hi"
    assert fake_tools.CURRENT_ORDER_ID == "o1"
    fake_backend.start({})
    assert fake_backend.fake_get_conversation_context().current_order is None
    assert fake_tools.CURRENT_ORDER_ID is None


def check_reply_mentions() -> None:
    from evals.evaluators import reply_mentions

    out = {"reply": "Le total est de 12 600 DZD, livraison jeudi."}
    assert reply_mentions(outputs=out, reference_outputs={"reply_mentions": ["12600", "khamis|jeudi"]})["score"] == 1
    assert reply_mentions(outputs=out, reference_outputs={"reply_mentions": ["nike air max"]})["score"] == 0
    assert reply_mentions(outputs=out, reference_outputs={})["score"] is None


def check_hydrate_uses_backend() -> None:
    from langchain_core.messages import AIMessage, HumanMessage
    from evals import fake_backend
    from models.state import AgentState, ReplaceMessages, messages_reducer
    from nodes.memory import _with_backend

    fake_backend.install()
    fake_backend.start({"has_order": True, "messages": ["template"]})
    fake_backend.add("customer", "chhal total?")
    # RAM holds an old, different chat; the database must win.
    state = AgentState(messages=[HumanMessage("old"), AIMessage("old reply"), HumanMessage("chhal total?")])
    updates = _with_backend(state, {})
    assert updates["backend_context"].current_order.total_amount == 12600
    new = messages_reducer(state.messages, updates["messages"])
    assert isinstance(updates["messages"], ReplaceMessages)
    assert [(m.type, m.content) for m in new] == [("ai", "template"), ("human", "chhal total?")], new
    # No backend (e.g. back is down): history is left alone.
    import nodes.memory
    nodes.memory.get_conversation_context = lambda limit=20: None
    try:
        assert "messages" not in _with_backend(state, {})
    finally:
        fake_backend.install()


def check_checkpoint_allows_new_classes() -> None:
    import logging
    from langchain_core.messages import HumanMessage
    from evals import fake_backend
    from graph import app
    from models.state import ReplaceMessages

    seen: list[str] = []

    class _H(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            seen.append(record.getMessage())

    handler = _H(level=logging.WARNING)
    logging.getLogger().addHandler(handler)
    try:
        fake_backend.start({"has_order": True, "messages": ["template"]})
        value = {"backend_context": fake_backend.fake_get_conversation_context(), "messages": ReplaceMessages([HumanMessage("x")])}
        serde = app.checkpointer.serde
        back = serde.loads_typed(serde.dumps_typed(value))
    finally:
        logging.getLogger().removeHandler(handler)
    assert back["backend_context"] == value["backend_context"], back
    assert not [m for m in seen if "unregistered" in m], seen


def main() -> None:
    checks = (
        check_fake_tools, check_install, check_last_turn_reply, check_outcome_of, check_evaluators,
        check_llm_failure_counter, check_fake_backend, check_reply_mentions, check_hydrate_uses_backend,
        check_checkpoint_allows_new_classes,
    )
    for check in checks:
        check()
        print(f"ok  {check.__name__}")


if __name__ == "__main__":
    main()
