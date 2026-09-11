import json
import logging
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from models.state import AgentState, CheckResult
from tools import TOOL_DESCRIPTIONS
from utils import call_json, struct_schema_hint

logger = logging.getLogger(__name__)


def check_llm(state: AgentState) -> dict:
    system = (
        "You are the intent classifier of an e-commerce assistant. Available intents:\n"
        + "\n".join(f"- {name}: {desc}" for name, desc in TOOL_DESCRIPTIONS.items())
        + "\nDecide whether the customer's latest message needs a tool-backed action or can be answered "
        "directly:\n"
        "- Plain conversation or lightweight questions -> needs_tool=false, set reply.\n"
        "- Needs an action covered by one of the available intents -> needs_tool=true, tool_name=that intent.\n"
        "- Needs an action NOT covered by any available intent -> needs_tool=true and set tool_name to a "
        "short proposed intent name (e.g. 'warrantyClaim', 'refundRequest') so it can be escalated.\n"
        + struct_schema_hint(CheckResult)
    )
    messages = [SystemMessage(content=system), *state.messages]
    fallback = CheckResult(
        needs_tool=False,
        reply="I couldn't process that request. Could you please rephrase?",
    )
    result = call_json(model, CheckResult, fallback, messages)
    return {
        "tool_calls": [{"name": result.tool_name}] if (result.needs_tool and result.tool_name) else [],
        "needs_tool": result.needs_tool,
        "reply": result.reply,
    }
