import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from config import model
from models.state import AgentState

logger = logging.getLogger(__name__)


def reply(state: AgentState) -> dict:
    if not state.needs_tool:
        text = state.reply if state.reply.strip() else "I understood your request."
    else:
        tool_result = state.tool_outputs[-1] if state.tool_outputs else "No tool output available."
        user_text = ""
        for m in reversed(state.messages):
            content = getattr(m, "content", "")
            if getattr(m, "type", "") == "human" and content:
                user_text = content if isinstance(content, str) else str(content)
                break
        response = model.invoke([
            SystemMessage(
                content=(
                    "You are a helpful e-commerce assistant. Answer the user's request based only on "
                    "the tool result provided. When the result lists products, present them as a short "
                    "bulleted list with name and price in the given currency, and note stock availability "
                    "if relevant. If the result says no products were found, acknowledge that politely. "
                    "Always use the exact currency code from the tool result (DZD for orders); never "
                    "invent or substitute a currency symbol."
                )
            ),
            HumanMessage(content=f"Tool result:\n{tool_result}\n\nUser request: {user_text}"),
        ])
        text = response.content if hasattr(response, "content") else str(response)
    return {"messages": [AIMessage(content=text)]}


def escalate(state: AgentState) -> dict:
    logger.warning(
        "ESCALATION to human agent -> proposed_intent=%s",
        state.proposed_intent,
    )
    return {"needs_tool": False, "reply": ""}
