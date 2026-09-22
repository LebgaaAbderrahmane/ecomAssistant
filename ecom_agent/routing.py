from flows import flow_draft
from models.state import AgentState


def route(state: AgentState) -> str:
    return "query_tool" if state.needs_tool else "reply"


def draft_route(state: AgentState) -> str:
    return {"continue": "extract_tool_args", "cancel": "reply"}.get(state.flow_direction, "check_llm")


def after_extract(state: AgentState) -> str:
    _, draft = flow_draft(state)
    if draft is not None and draft.status == "ready":
        return "calling_tool"
    return "ask_reply"


def query_escalate_route(state: AgentState) -> str:
    return "escalate" if state.escalation else "flow_resolver"


def flow_route(state: AgentState) -> str:
    if state.flow_action in ("NO_FLOW_LOOKUP", "CLARIFY", "INVALID_ACTION"):
        return "reply"
    _, draft = flow_draft(state)
    if draft is not None and draft.status == "drafting":
        return "extract_tool_args"
    return "calling_tool"
