import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from models.state import AgentState, FlowResolution
from models.domain import (
    FlowState, Flow, ToolCallDraft, ProductDiscoveryInput, ProductDiscoveryContext, Filter,
)
from models.conversation import ConversationMemory
from utils import last_user_text, call_json, struct_schema_hint

logger = logging.getLogger(__name__)

PRODUCT_DISCOVERY_TOOLS = {"searchProducts", "recallPreviousProducts", "selectProduct", "getProductDetails", "suggestProducts"}


def active_flow(mem: ConversationMemory, resolved_flow_id: str | None) -> Flow | None:
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def flow_resolver(state: AgentState) -> dict:
    mem = state.conversation_memory.model_copy(deep=True)
    flow_summaries = [
        {
            "flow_id": f.flow_id,
            "state": f.state.value if isinstance(f.state, FlowState) else f.state,
            "product": f.product_discovery.input.product_name if f.product_discovery and f.product_discovery.input else None,
            "order": f.order.model_dump(exclude_none=True) if f.order else None,
        }
        for f in mem.flows
    ]
    last_tool = state.tool_outputs[-1] if state.tool_outputs else (state.tool_calls[0].get("name") if state.tool_calls else "unknown")
    context = {
        "active_flow_id": mem.active_flow_id,
        "flows": flow_summaries,
        "selected_tool": last_tool,
        "user_request": last_user_text(state.messages),
    }

    system = (
        "You resolve which conversation flow a tool call should be applied to. Rules:\n"
        "- If the user request does not belong to any flow, return NO_FLOW_LOOKUP.\n"
        "- If there are no flows, or the user is starting a new product search, return CREATE.\n"
        "- If an active flow is compatible with the request, return CONTINUE with its flow_id.\n"
        "- If the request refers to another existing flow, return CONTINUE with that flow_id.\n"
        "- A request to BUY or ORDER a product is a valid order action: if a flow already has the "
        "product selected, return CONTINUE with its flow_id; otherwise return CREATE (an order flow). "
        "Never return INVALID_ACTION for a buy/order request.\n"
        "- escalateConversation applies only when the matter is truly out of scope; return "
        "INVALID_ACTION with a reason.\n"
        "- If it is ambiguous which flow applies, return CLARIFY with a reason.\n"
        + struct_schema_hint(FlowResolution)
    )
    fallback = FlowResolution(action="CLARIFY", reason="Unable to resolve the flow automatically.")
    result = call_json(
        model,
        FlowResolution,
        fallback,
        [
            SystemMessage(content=system),
            HumanMessage(content=json.dumps(context, default=str)),
        ],
    )

    resolved_flow_id = state.resolved_flow_id
    now = datetime.now(timezone.utc)
    if result.action == "CREATE":
        new_flow_id = uuid.uuid4().hex
        tool_name = state.tool_calls[0].get("name", "") if state.tool_calls else ""
        if tool_name in PRODUCT_DISCOVERY_TOOLS:
            flow_state = FlowState.PRODUCT_DISCOVERY
            product_discovery = ProductDiscoveryContext(input=ProductDiscoveryInput(product_name=result.product_name, filters=result.filters or Filter()))
        else:
            flow_state = FlowState.ORDER
            product_discovery = None
        new_flow = Flow(
            flow_id=new_flow_id,
            state=flow_state,
            created_at=now,
            updated_at=now,
            product_discovery=product_discovery,
        )
        if tool_name:
            new_flow.tool_draft = ToolCallDraft(tool_name=tool_name)
        mem.flows.append(new_flow)
        mem.active_flow_id = new_flow_id
        resolved_flow_id = new_flow_id
    elif result.action == "CONTINUE":
        mem.active_flow_id = result.flow_id
        resolved_flow_id = result.flow_id
        flow = active_flow(mem, resolved_flow_id)
        if flow is not None:
            tool_name = state.tool_calls[0].get("name", "") if state.tool_calls else ""
            if (
                tool_name
                and (flow.tool_draft is None or flow.tool_draft.status in ("executed", "cancelled") or flow.tool_draft.tool_name != tool_name)
            ):
                flow.tool_draft = ToolCallDraft(tool_name=tool_name)
            flow.updated_at = now
    elif result.action in ("NO_FLOW_LOOKUP", "CLARIFY", "INVALID_ACTION"):
        resolved_flow_id = None

    updates: dict[str, Any] = {
        "conversation_memory": mem,
        "resolved_flow_id": resolved_flow_id,
        "flow_action": result.action,
    }
    if result.action in ("NO_FLOW_LOOKUP", "CLARIFY", "INVALID_ACTION"):
        updates["tool_outputs"] = [f"{result.action}: {result.reason or 'Please clarify.'}"]
    if result.action == "CREATE":
        updates["tool_calls"] = []
    logger.info("flow_resolver -> action=%s flow_id=%s", result.action, resolved_flow_id)
    return updates
