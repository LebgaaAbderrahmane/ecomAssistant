from typing import Any

from langchain_core.runnables import RunnableConfig
from langgraph.store.base import BaseStore

from models.state import AgentState
from models.conversation import ConversationMemory


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


def hydrate(state: AgentState, *, store: BaseStore, config: RunnableConfig) -> dict:
    resets = _fresh_turn()
    if state.conversation_memory.flows:
        return resets
    ns, _ = _store_config(config)
    item = store.get(ns, "conversation_memory")
    if item is None:
        return resets
    return {**resets, "conversation_memory": ConversationMemory(**item.value)}


def persist(state: AgentState, *, store: BaseStore, config: RunnableConfig) -> dict:
    ns, _ = _store_config(config)
    store.put(ns, "conversation_memory", state.conversation_memory.model_dump(mode="json"))
    return {}
