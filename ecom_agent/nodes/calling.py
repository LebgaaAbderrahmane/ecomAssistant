import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from config import model
from flows import active_flow, sync_shipping
from models.domain import Product, ProductDiscoveryContext
from models.state import AgentState
from prompts.calling import calling_system
from text.messages import last_user_text
from tools import PRODUCT_TOOLS, TOOL_NODE_CONFIG, TOOLS, tool_for, tool_node

logger = logging.getLogger(__name__)


def _tool_result_products(content: str) -> list[Product] | None:
    try:
        data = json.loads(content)
    except (json.JSONDecodeError, TypeError):
        return None
    if isinstance(data, dict):
        unwrapped = None
        for key in ("products", "results"):
            if isinstance(data.get(key), list):
                unwrapped = data[key]
                break
        if unwrapped is not None:
            data = unwrapped
        elif data.get("price") is not None and (
            data.get("product_id") or data.get("productId") or data.get("id")
        ):
            data = [data]
        else:
            return None
    if not isinstance(data, list):
        return None
    products = []
    for item in data:
        pid = item.get("product_id") or item.get("productId") or item.get("id")
        name = item.get("product_name") or item.get("productName") or item.get("name")
        price = item.get("price")
        if not pid or not name or price is None:
            continue
        products.append(Product(product_id=str(pid), product_name=str(name), price=float(price)))
    return products or None


def _run_tools(ai_msg: AIMessage, **error_fields: Any) -> list:
    try:
        return tool_node.invoke([ai_msg], config=TOOL_NODE_CONFIG)
    except Exception as e:
        logger.warning("calling_tool delegate failed (%s)", e)
        return [ToolMessage(content=f"Tool execution failed: {e}", **error_fields)]


def _pick_product(called_name: str, call_args: dict[str, Any], prods: list[Product]) -> Product:
    if called_name == "selectProduct":
        name_sel = str(call_args.get("productName") or "").strip()
        pid = str(call_args.get("productId") or "").strip()
        if pid:
            return next((p for p in prods if p.product_id == pid), prods[0])
        if name_sel:
            return next(
                (p for p in prods if p.product_name.lower() == name_sel.lower() or p.product_id == name_sel),
                prods[0],
            )
    elif call_args.get("product_id") or call_args.get("productId"):
        pid = call_args.get("product_id") or call_args.get("productId")
        return next((p for p in prods if p.product_id == str(pid)), prods[0])
    return prods[0]


def calling_tool(state: AgentState) -> dict:
    mem = state.conversation_memory.model_copy(deep=True)
    flow = active_flow(mem, state.resolved_flow_id)
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
            sync_shipping(flow, gi)

    if draft is not None and draft.status == "ready":
        t = tool_for(draft.tool_name)
        if t is None:
            return {}
        tool_call_id = "draft-" + uuid.uuid4().hex[:8]
        ai_msg = AIMessage(
            content="",
            tool_calls=[{
                "name": t.name,
                "args": dict(draft.args),
                "id": tool_call_id,
                "type": "tool_call",
            }],
        )
        tool_messages = _run_tools(ai_msg, name=t.name, tool_call_id=tool_call_id)
        called_name = t.name
        call_args = dict(draft.args)
        flow.tool_draft = None
        flow.updated_at = datetime.now(timezone.utc)
        logger.info("calling_tool executed ready draft -> %s %s", called_name, call_args)
    else:
        # No ready draft: let the model choose the tool call itself.
        user_text = last_user_text(state.messages)
        tool_context = state.tool_outputs[-1] if state.tool_outputs else "No tool selected."
        model_with_tools = model.bind_tools(TOOLS)
        system = calling_system(state.resolved_flow_id, tool_context)
        ai_msg = model_with_tools.invoke([SystemMessage(content=system), HumanMessage(content=user_text)])
        if getattr(ai_msg, "tool_calls", None):
            tool_messages = _run_tools(ai_msg, tool_call_id="delegate-error")
        else:
            logger.warning("Tool model returned no tool call; skipping tool execution")
            tool_messages = [
                ToolMessage(content="No tool was called by the assistant.", tool_call_id="no_tool_call")
            ]
        if hasattr(ai_msg, "tool_calls") and ai_msg.tool_calls:
            called_name = ai_msg.tool_calls[0].get("name", "")
            call_args = ai_msg.tool_calls[0].get("args") or {}

    if called_name in PRODUCT_TOOLS and tool_messages:
        prods = _tool_result_products(getattr(tool_messages[0], "content", ""))
        if prods and flow is not None:
            if flow.product_discovery is None:
                flow.product_discovery = ProductDiscoveryContext()
            flow.product_discovery.tool_results = prods
            flow.product_discovery.selected_product = _pick_product(called_name, call_args, prods)

    return {
        "messages": [ai_msg, *tool_messages],
        "tool_outputs": [getattr(m, "content", str(m)) for m in tool_messages],
        "conversation_memory": mem,
        "needs_tool": True,
    }
