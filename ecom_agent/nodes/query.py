import json
import logging

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from flows import active_flow, selected_product
from llm.structured import call_json
from models.state import AgentState, ToolChoice
from prompts.common import struct_schema_hint
from prompts.query import query_system
from text.messages import last_user_text, recent_transcript
from text.patterns import BUY_RE, STOP_WORDS, WORD_RE
from tools import TOOL_DESCRIPTIONS, TOOL_NAMES

logger = logging.getLogger(__name__)


def _flow_context(state: AgentState) -> dict | None:
    active = active_flow(state.conversation_memory, state.resolved_flow_id)
    if active is None:
        return None
    selected = selected_product(active)
    if selected is None and active.product_discovery and active.product_discovery.tool_results:
        selected = active.product_discovery.tool_results[0].model_dump()
    return {
        "flow_id": active.flow_id,
        "state": active.state.value if isinstance(active.state, type) else active.state,
        "selected_product": selected,
    }


def _selected_flows(state: AgentState) -> list[dict]:
    selected_flows = []
    for f in state.conversation_memory.flows:
        if f.product_discovery and f.product_discovery.selected_product is not None:
            p = f.product_discovery.selected_product
            selected_flows.append({
                "flow_id": f.flow_id,
                "state": f.state.value if isinstance(f.state, type) else f.state,
                "product_name": p.product_name,
                "product_id": p.product_id,
            })
    return selected_flows


def _buy_fast_path(state: AgentState, user_text: str) -> bool:
    """True when the customer uses a buy word and names an already selected product."""
    low = user_text.lower()
    if not BUY_RE.search(low):
        return False
    tokens = set(t for t in WORD_RE.findall(low) if t not in STOP_WORDS)
    for f in state.conversation_memory.flows:
        if f.product_discovery and f.product_discovery.selected_product is not None:
            p = f.product_discovery.selected_product
            if tokens & set(WORD_RE.findall(p.product_name.lower())):
                return True
    return False


def query_tool(state: AgentState) -> dict:
    call = state.tool_calls[0] if state.tool_calls else {}
    if not call:
        return {"tool_outputs": ["No tools provided."]}
    user_text = last_user_text(state.messages)
    flow_context = _flow_context(state)
    selected_flows = _selected_flows(state)

    if _buy_fast_path(state, user_text):
        choice = ToolChoice(tool="createOrder", arguments={})
        result = f"Selected tool: {choice.tool}. Args: {choice.arguments} (deterministic buy fast-path)"
        logger.info("query_tool -> %s", result)
        return {
            "tool_outputs": [result],
            "tool_calls": [{"name": choice.tool, "arguments": choice.arguments}],
        }

    system = query_system(TOOL_DESCRIPTIONS, struct_schema_hint(ToolChoice))
    fallback_name = call.get("name") if call.get("name") in TOOL_NAMES else "searchProducts"
    fallback = ToolChoice(tool=fallback_name, arguments={})
    choice = call_json(
        model,
        ToolChoice,
        fallback,
        [
            SystemMessage(content=system),
            HumanMessage(content=json.dumps({
                "requested_tool": call.get("name"),
                "user_request": user_text,
                "active_flow": flow_context,
                "flows_with_selected_product": selected_flows,
                "recent_conversation": recent_transcript(state.messages),
            }, ensure_ascii=False, default=str)),
        ],
    )
    proposed = (choice.proposed_new_tool or "").strip()
    if proposed or choice.tool is None or choice.tool == "escalateConversation":
        intent = proposed or (choice.tool or "unsupported")
        logger.warning("query_tool -> ESCALATE proposed_intent=%s", intent)
        return {
            "escalation": True,
            "proposed_intent": intent,
            "needs_tool": False,
            "reply": "",
            "tool_calls": [],
            "tool_outputs": [f"ESCALATE: {intent}"],
        }
    result = f"Selected tool: {choice.tool}. Args: {choice.arguments}"
    logger.info("query_tool -> %s", result)
    return {
        "tool_outputs": [result],
        "tool_calls": [{"name": choice.tool, "arguments": choice.arguments}],
    }
