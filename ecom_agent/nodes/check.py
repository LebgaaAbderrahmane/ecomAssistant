import json
import logging
from typing import Any

from langchain_core.messages import SystemMessage

from config import model
from llm.structured import call_json
from models.state import AgentState, CheckResult
from prompts.check import check_system
from prompts.common import struct_schema_hint
from tools import TOOL_DESCRIPTIONS

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
    system = check_system(TOOL_DESCRIPTIONS, struct_schema_hint(CheckResult), _summarize_flows(state))
    messages = [SystemMessage(content=system), *state.messages]
    # If the classifier cannot run or parse (LLM down or rate-limited), do not
    # guess: escalate so a human takes the conversation over.
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
