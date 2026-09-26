import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from flows import active_flow
from llm.structured import call_json
from models.domain import Filter, Flow, FlowState, ProductDiscoveryContext, ProductDiscoveryInput, ToolCallDraft
from models.state import AgentState, FlowResolution
from prompts.common import struct_schema_hint
from prompts.flow import FLOW_RULES
from text.messages import last_user_text
from tools import PRODUCT_TOOLS

logger = logging.getLogger(__name__)

NO_FLOW_ACTIONS = ("NO_FLOW_LOOKUP", "CLARIFY", "INVALID_ACTION")


def _flow_summary(f: Flow) -> dict[str, Any]:
    return {
        "flow_id": f.flow_id,
        "state": f.state.value if isinstance(f.state, FlowState) else f.state,
        "product": f.product_discovery.input.product_name if f.product_discovery and f.product_discovery.input else None,
        "order": f.order.model_dump(exclude_none=True) if f.order else None,
    }


def _new_flow(tool_name: str, result: FlowResolution, now: datetime) -> Flow:
    if tool_name in PRODUCT_TOOLS:
        flow_state = FlowState.PRODUCT_DISCOVERY
        product_discovery = ProductDiscoveryContext(
            input=ProductDiscoveryInput(product_name=result.product_name, filters=result.filters or Filter())
        )
    else:
        flow_state = FlowState.ORDER
        product_discovery = None
    new_flow = Flow(
        flow_id=uuid.uuid4().hex,
        state=flow_state,
        created_at=now,
        updated_at=now,
        product_discovery=product_discovery,
    )
    if tool_name:
        new_flow.tool_draft = ToolCallDraft(tool_name=tool_name)
    return new_flow


def flow_resolver(state: AgentState) -> dict:
    mem = state.conversation_memory.model_copy(deep=True)
    tool_name = state.tool_calls[0].get("name", "") if state.tool_calls else ""
    last_tool = state.tool_outputs[-1] if state.tool_outputs else (
        state.tool_calls[0].get("name") if state.tool_calls else "unknown"
    )
    context = {
        "active_flow_id": mem.active_flow_id,
        "flows": [_flow_summary(f) for f in mem.flows],
        "selected_tool": last_tool,
        "user_request": last_user_text(state.messages),
    }
    fallback = FlowResolution(action="CLARIFY", reason="Unable to resolve the flow automatically.")
    result = call_json(
        model,
        FlowResolution,
        fallback,
        [
            SystemMessage(content=FLOW_RULES + struct_schema_hint(FlowResolution)),
            HumanMessage(content=json.dumps(context, default=str)),
        ],
    )

    resolved_flow_id = state.resolved_flow_id
    now = datetime.now(timezone.utc)
    if result.action == "CREATE":
        new_flow = _new_flow(tool_name, result, now)
        mem.flows.append(new_flow)
        mem.active_flow_id = new_flow.flow_id
        resolved_flow_id = new_flow.flow_id
    elif result.action == "CONTINUE":
        mem.active_flow_id = result.flow_id
        resolved_flow_id = result.flow_id
        flow = active_flow(mem, resolved_flow_id)
        if flow is not None:
            draft = flow.tool_draft
            if tool_name and (
                draft is None or draft.status in ("executed", "cancelled") or draft.tool_name != tool_name
            ):
                flow.tool_draft = ToolCallDraft(tool_name=tool_name)
            flow.updated_at = now
    elif result.action in NO_FLOW_ACTIONS:
        resolved_flow_id = None

    updates: dict[str, Any] = {
        "conversation_memory": mem,
        "resolved_flow_id": resolved_flow_id,
        "flow_action": result.action,
    }
    # NO_FLOW_LOOKUP keeps query_tool's "Selected tool: ..." output; calling_tool reads it.
    if result.action in ("CLARIFY", "INVALID_ACTION"):
        updates["tool_outputs"] = [f"{result.action}: {result.reason or 'Please clarify.'}"]
    if result.action == "CREATE":
        updates["tool_calls"] = []
    logger.info("flow_resolver -> action=%s flow_id=%s", result.action, resolved_flow_id)
    return updates
