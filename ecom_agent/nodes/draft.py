from typing import Any

import drafts
from config import model
from models.state import AgentState
from text.messages import last_user_text


def draft_gate(state: AgentState) -> dict:
    result = drafts.gate(state.conversation_memory, state.resolved_flow_id, last_user_text(state.messages), model)
    updates: dict[str, Any] = {"flow_direction": result.direction}
    if result.direction == "cancel":
        updates.update({"conversation_memory": result.notes, "needs_tool": False, "reply": result.reply})
    return updates


def extract_tool_args(state: AgentState) -> dict:
    mem = state.conversation_memory.model_copy(deep=True)
    if not drafts.collect(mem, state.resolved_flow_id, last_user_text(state.messages), model):
        return {}
    return {"conversation_memory": mem}


def ask_reply(state: AgentState) -> dict:
    question = drafts.ask(
        state.conversation_memory, state.resolved_flow_id, last_user_text(state.messages), model,
    )
    if question is None:
        return {}
    return {"needs_tool": False, "reply": question}
