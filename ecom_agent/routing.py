from models.state import AgentState


def route(state: AgentState) -> str:
    return "query_tool" if state.needs_tool else "reply"


def draft_route(state: AgentState) -> str:
    return {"continue": "extract_tool_args", "cancel": "reply"}.get(state.flow_direction, "check_llm")


def query_escalate_route(state: AgentState) -> str:
    return "escalate" if state.escalation else "flow_resolver"


def flow_route(state: AgentState) -> str:
    if state.flow_action in ("NO_FLOW_LOOKUP", "CLARIFY", "INVALID_ACTION"):
        return "reply"
    from nodes.draft import _flow_draft
    _, draft = _flow_draft(state)
    if draft is not None and draft.status == "drafting":
        return "extract_tool_args"
    return "calling_tool"
