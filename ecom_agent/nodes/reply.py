import json
import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from config import model
from models.state import AgentState
from prompts.common import DEFAULT_REPLY
from prompts.reply import REPLY_FROM_TOOL, reply_input
from text.messages import last_user_text
from tools import escalateConversation

logger = logging.getLogger(__name__)


def reply(state: AgentState) -> dict:
    if not state.needs_tool:
        text = state.reply if state.reply.strip() else DEFAULT_REPLY
    else:
        tool_result = state.tool_outputs[-1] if state.tool_outputs else "No tool output available."
        user_text = ""
        for m in reversed(state.messages):
            content = getattr(m, "content", "")
            if getattr(m, "type", "") == "human" and content:
                user_text = content if isinstance(content, str) else str(content)
                break
        response = model.invoke([
            SystemMessage(content=REPLY_FROM_TOOL),
            HumanMessage(content=reply_input(tool_result, user_text)),
        ])
        text = response.content if hasattr(response, "content") else str(response)
    return {"messages": [AIMessage(content=text)]}


def escalate(state: AgentState) -> dict:
    intent = state.proposed_intent or "unsupported"
    user_text = last_user_text(state.messages)
    reason = f"[{intent}] Customer request: {user_text[:200]}"
    result = None
    try:
        result = escalateConversation.invoke({"reason": reason})
    except Exception as e:
        logger.warning("escalateConversation tool failed (%s)", e)
        result = json.dumps({"escalated": False, "error": str(e)}, ensure_ascii=False)
    logger.warning(
        "ESCALATION to human agent -> proposed_intent=%s tool_result=%s",
        state.proposed_intent,
        result,
    )
    return {"needs_tool": False, "reply": "", "tool_outputs": [result] if result else []}
