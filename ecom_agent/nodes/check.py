import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from models.state import AgentState, CheckResult
from tools import TOOL_DESCRIPTIONS
from utils import call_json, struct_schema_hint

logger = logging.getLogger(__name__)


def _summarize_flows(state: AgentState) -> str:
    flows = state.conversation_memory.flows
    if not flows:
        return ""
    summaries: list[dict[str, Any]] = []
    for f in flows:
        s: dict[str, Any] = {
            "flow_id": f.flow_id,
            "state": f.state.value if hasattr(f.state, "value") else f.state,
        }
        if f.product_discovery and f.product_discovery.selected_product:
            p = f.product_discovery.selected_product
            s["product"] = {"name": p.product_name, "price": p.price, "id": p.product_id}
        if f.order:
            s["order"] = f.order.model_dump(exclude_none=True)
        if f.shipping:
            ship = {k: v for k, v in f.shipping.model_dump().items() if v}
            if ship:
                s["shipping"] = ship
        summaries.append(s)
    return json.dumps(summaries, indent=2, ensure_ascii=False)


def check_llm(state: AgentState) -> dict:
    memory_hint = _summarize_flows(state)
    system = (
        "You are the intent classifier of an e-commerce assistant. Available intents:\n"
        + "\n".join(f"- {name}: {desc}" for name, desc in TOOL_DESCRIPTIONS.items())
        + "\nDecide whether the customer's latest message needs a tool-backed action or can be answered "
        "directly:\n"
        "- Plain conversation or lightweight questions -> needs_tool=false, set reply.\n"
        "- Questions about existing data in the conversation context below (e.g. 'what did I order?', "
        "'what product was I looking at?', 'what's my shipping address?') -> needs_tool=false, set reply "
        "using the context. Never invent data; only use what is shown.\n"
        "- Needs an action covered by one of the available intents -> needs_tool=true, tool_name=that intent.\n"
        "- Needs an action NOT covered by any available intent -> needs_tool=true and set tool_name to a "
        "short proposed intent name (e.g. 'warrantyClaim', 'refundRequest') so it can be escalated.\n"
        + struct_schema_hint(CheckResult)
    )
    if memory_hint:
        system += (
            "\n\nCurrent conversation context (use this to answer questions about existing "
            "orders, products, shipping, etc.):\n" + memory_hint
        )
    messages = [SystemMessage(content=system), *state.messages]
    # When the classifier cannot run/parse (e.g. the LLM is rate-limited or
    # down), do not guess: escalate to a human rather than emitting a canned
    # reply. needs_tool=true agents escalateConversation, which takes the
    # conversation over for a live agent.
    fallback = CheckResult(
        needs_tool=True,
        tool_name="escalateConversation",
        reply="",
    )
    result = call_json(model, CheckResult, fallback, messages)
    return {
        "tool_calls": [{"name": result.tool_name}] if (result.needs_tool and result.tool_name) else [],
        "needs_tool": result.needs_tool,
        "reply": result.reply,
    }
