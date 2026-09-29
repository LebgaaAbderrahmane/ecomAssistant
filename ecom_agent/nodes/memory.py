from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore

from models.state import AgentState, ReplaceMessages
from models.conversation import ConversationMemory
from tools.grpc import get_conversation_context

CONTEXT_MESSAGES = 20


def _store_config(config: RunnableConfig) -> tuple[tuple[str, str], str]:
    cfg = (config or {}).get("configurable", {}) or {}
    store_key = cfg.get("store_key") or cfg.get("thread_id") or "default"
    return ("assistant", str(store_key)), str(store_key)


def _fresh_turn() -> dict[str, Any]:
    return {
        "escalation": False,
        "proposed_intent": None,
        "needs_tool": False,
        "reply": "",
        "flow_direction": "normal",
        "flow_action": None,
        "resolved_flow_id": None,
        "tool_calls": [],
        "tool_outputs": [],
    }


def _with_backend(state: AgentState, updates: dict[str, Any]) -> dict[str, Any]:
    """Load what back knows. Its messages become the chat history: the database is the truth."""
    ctx = get_conversation_context(CONTEXT_MESSAGES)
    updates["backend_context"] = ctx
    if ctx is None or not ctx.messages:
        return updates
    history = ctx.chat_history()
    # back saves the customer message before calling the agent, so it is normally the last one.
    current = state.messages[-1] if state.messages else None
    if current is not None and (not history or history[-1].content != current.content):
        history.append(current)
    updates["messages"] = ReplaceMessages(history)
    return updates


def hydrate(state: AgentState, *, store: BaseStore, config: RunnableConfig) -> dict:
    resets = _fresh_turn()
    if state.conversation_memory.flows:
        return _with_backend(state, resets)
    ns, _ = _store_config(config)
    item = store.get(ns, "conversation_memory")
    if item is None:
        return _with_backend(state, resets)
    return _with_backend(state, {**resets, "conversation_memory": ConversationMemory(**item.value)})


def persist(state: AgentState, *, store: BaseStore, config: RunnableConfig) -> dict:
    ns, _ = _store_config(config)
    store.put(ns, "conversation_memory", state.conversation_memory.model_dump(mode="json"))
    return {}
