import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.prebuilt import ToolNode

from config import model
from models.state import AgentState
from models.domain import (
    Product, ProductDiscoveryContext, ShippingContext,
)
from tools import TOOLS, tool_for, make_create_order_tool
from utils import last_user_text

logger = logging.getLogger(__name__)

PRODUCT_RESULT_TOOLS = {"searchProducts", "getProductDetails", "recallPreviousProducts", "selectProduct", "suggestProducts"}


def _tool_result_products(content: str) -> list[Product] | None:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(data, dict):
        data = [data]
    if not isinstance(data, list):
        return None
    products = []
    for item in data:
        pid = item.get("product_id") or item.get("id")
        name = item.get("product_name") or item.get("name")
        price = item.get("price")
        if not pid or not name or price is None:
            continue
        products.append(Product(product_id=str(pid), product_name=str(name), price=float(price)))
    return products or None


def _active_flow(mem, resolved_flow_id):
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def calling_tool(state: AgentState) -> dict:
    from nodes.flow import active_flow as _af

    mem = state.conversation_memory.model_copy(deep=True)
    flow = _af(mem, state.resolved_flow_id)
    draft = flow.tool_draft if flow is not None else None

    ai_msg: Any = None
    tool_messages: list[Any] = []
    called_name = ""
    call_args: dict[str, Any] = {}

    if flow is not None:
        gi = mem.global_information
        if (gi.wilaya or gi.commune or gi.address) and (
            flow.shipping is None
            or flow.shipping.wilaya != gi.wilaya
            or flow.shipping.commune != gi.commune
            or flow.shipping.address != gi.address
        ):
            flow.shipping = ShippingContext(
                wilaya=gi.wilaya,
                commune=gi.commune,
                address=gi.address,
                shipping_cost=flow.shipping.shipping_cost if flow.shipping else None,
            )

    if draft is not None and draft.status == "ready":
        t = tool_for(draft.tool_name, flow)
        if t is None:
            return {}
        ai_msg = AIMessage(
            content="",
            tool_calls=[{
                "name": t.name,
                "args": dict(draft.args),
                "id": "draft-" + uuid.uuid4().hex[:8],
                "type": "tool_call",
            }],
        )
        try:
            tool_messages = ToolNode([t]).invoke([ai_msg])
        except Exception as e:
            logger.warning("draft tool execution failed (%s)", e)
            tool_messages = [ToolMessage(
                content=f"Tool execution failed: {e}", tool_call_id="draft-exec-error"
            )]
        called_name = t.name
        call_args = dict(draft.args)
        flow.tool_draft = None
        flow.updated_at = datetime.now(timezone.utc)
        logger.info("calling_tool executed ready draft -> %s %s", called_name, call_args)
    else:
        user_text = last_user_text(state.messages)
        tool_context = state.tool_outputs[-1] if state.tool_outputs else "No tool selected."
        order_tool = make_create_order_tool(flow)
        tools = [order_tool] + [t for t in TOOLS if t.name != "createOrder"]
        runtime_tool_node = ToolNode(tools)
        runtime_tool_model = model.bind_tools(tools)

        system = (
            "You are an e-commerce assistant. Call the requested tool to fulfill the user's request."
            f"\nResolved flow id: {state.resolved_flow_id or 'none'}. Tool context: {tool_context}"
        )
        ai_msg = runtime_tool_model.invoke([SystemMessage(content=system), HumanMessage(content=user_text)])
        if getattr(ai_msg, "tool_calls", None):
            tool_messages = runtime_tool_node.invoke([ai_msg])
        else:
            logger.warning("Tool model returned no tool call; skipping ToolNode")
            tool_messages = [
                ToolMessage(content="No tool was called by the assistant.", tool_call_id="no_tool_call")
            ]
        if hasattr(ai_msg, "tool_calls") and ai_msg.tool_calls:
            called_name = ai_msg.tool_calls[0].get("name", "")
            call_args = ai_msg.tool_calls[0].get("args") or {}

    if called_name in PRODUCT_RESULT_TOOLS and tool_messages:
        prods = _tool_result_products(getattr(tool_messages[0], "content", ""))
        if prods and flow is not None:
            if flow.product_discovery is None:
                flow.product_discovery = ProductDiscoveryContext()
            flow.product_discovery.tool_results = prods
            selected = prods[0]
            if called_name == "selectProduct":
                selector = str(call_args.get("selector") or "").strip()
                selected = next(
                    (p for p in prods if p.product_id == selector or p.product_name.lower() == selector.lower()),
                    prods[0],
                )
            elif call_args.get("product_id"):
                selected = next((p for p in prods if p.product_id == str(call_args.get("product_id"))), prods[0])
            flow.product_discovery.selected_product = selected

    return {
        "messages": [ai_msg, *tool_messages],
        "tool_outputs": [getattr(m, "content", str(m)) for m in tool_messages],
        "conversation_memory": mem,
        "needs_tool": True,
    }
