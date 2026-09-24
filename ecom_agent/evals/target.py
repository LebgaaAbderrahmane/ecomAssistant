"""Plays one test conversation into the agent graph and returns what happened."""
import logging
import time
import uuid

from langchain_core.messages import HumanMessage

from evals import fake_tools
from flows import flow_draft
from graph import app
from models.state import AgentState
from server import _last_reply
from text.messages import content_text

PAUSE_SECONDS = 0.0


class _FailureCounter(logging.Handler):
    def __init__(self) -> None:
        super().__init__(level=logging.WARNING)
        self.count = 0

    def emit(self, record: logging.LogRecord) -> None:
        self.count += 1


def last_turn_reply(messages: list) -> str:
    texts: list[str] = []
    for m in reversed(messages):
        if getattr(m, "type", "") == "human":
            break
        if getattr(m, "type", "") == "ai" and content_text(m).strip():
            texts.append(content_text(m))
    return "\n".join(reversed(texts))


def outcome_of(state: AgentState) -> str:
    if state.escalation:
        return "escalate"
    _, draft = flow_draft(state)
    if draft is not None and draft.status == "drafting":
        return "ask_info"
    return "reply"


def run_conversation(inputs: dict) -> dict:
    thread = uuid.uuid4().hex
    config = {"configurable": {"thread_id": thread, "store_key": thread}}
    counter = _FailureCounter()
    llm_logger = logging.getLogger("llm.client")
    llm_logger.addHandler(counter)
    try:
        result: dict = {}
        for text in inputs["turns"]:
            # Free-tier token limits are per minute, so spread the calls out.
            time.sleep(PAUSE_SECONDS)
            fake_tools.reset()
            result = app.invoke({"messages": [HumanMessage(content=text)]}, config=config)
    finally:
        llm_logger.removeHandler(counter)
    state = AgentState.model_validate(result)
    return {
        "tools_called": list(fake_tools.calls),
        "outcome": outcome_of(state),
        "reply": last_turn_reply(state.messages),
        "server_reply": _last_reply(state),
        "llm_failures": counter.count,
    }
