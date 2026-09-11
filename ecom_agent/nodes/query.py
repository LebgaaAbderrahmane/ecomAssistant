import json
import logging
import re as _re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from models.state import AgentState, ToolChoice
from models.conversation import ConversationMemory
from tools import (
    TOOL_NAMES, TOOL_DESCRIPTIONS, tool_for, make_create_order_tool, TOOLS,
)
from utils import (
    _BUY_RE, _STOP_WORDS, last_user_text, recent_transcript, call_json, struct_schema_hint,
)

logger = logging.getLogger(__name__)


def _active_flow(mem: ConversationMemory, resolved_flow_id: str | None):
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def query_tool(state: AgentState) -> dict:
    call = state.tool_calls[0] if state.tool_calls else {}
    if not call:
        return {"tool_outputs": ["No tools provided."]}
    user_text = last_user_text(state.messages)
    active = _active_flow(state.conversation_memory, state.resolved_flow_id)
    flow_context = None
    if active is not None:
        selected = None
        if active.product_discovery:
            if active.product_discovery.selected_product is not None:
                selected = active.product_discovery.selected_product.model_dump()
            elif active.product_discovery.tool_results:
                selected = active.product_discovery.tool_results[0].model_dump()
        flow_context = {
            "flow_id": active.flow_id,
            "state": active.state.value if isinstance(active.state, type) else active.state,
            "selected_product": selected,
        }
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

    low = user_text.lower()
    tokens = set(t for t in _re.findall(r"[a-z]{3,}", low) if t not in _STOP_WORDS)
    forced = None
    if _BUY_RE.search(low):
        for f in state.conversation_memory.flows:
            if f.product_discovery and f.product_discovery.selected_product is not None:
                p = f.product_discovery.selected_product
                p_tokens = set(_re.findall(r"[a-z]{3,}", p.product_name.lower()))
                if tokens & p_tokens:
                    forced = p
                    break
    if forced is not None:
        choice = ToolChoice(tool="createOrder", arguments={})
        result = f"Selected tool: {choice.tool}. Args: {choice.arguments} (deterministic buy fast-path)"
        logger.info("query_tool -> %s", result)
        return {
            "tool_outputs": [result],
            "tool_calls": [{"name": choice.tool, "arguments": choice.arguments}],
        }

    system = (
        "You pick the single best tool for the user's request. Available tools:\n"
        + "\n".join(f"- {name}: {desc}" for name, desc in TOOL_DESCRIPTIONS.items())
        + "\nRules:\n"
        "- Read `recent_conversation` before deciding. The user's latest message often answers an "
        "earlier question or continues an earlier subject - use that history to infer the true intent "
        "of the latest message.\n"
        "- When the user wants to BUY or ORDER a product that is already selected or visible in the "
        "conversation, choose createOrder and set quantity accordingly.\n"
        "- If a product is selected in `flows_with_selected_product` and the user refers to it, choose "
        "createOrder even if it is not the currently active flow.\n"
        "- Never invent tools: if `requested_tool` is not in the list above, ignore it and remap the "
        "request to the correct tool from the list.\n"
        "- If the request needs an intent that NONE of the available tools supports, set "
        "`proposed_new_tool` to the missing intent/tool name (e.g. 'warrantyClaim', 'refundRequest') "
        "and leave `tool` as null. This triggers a human escalation and no tool is run.\n"
        "- Only choose escalateConversation if no other tool fits.\n"
        + struct_schema_hint(ToolChoice)
    )
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
