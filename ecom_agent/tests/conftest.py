import json
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

# ecom_agent/.env may turn LangSmith tracing on. Tests must never send traces.
# This runs before `import config`, and load_dotenv does not replace values that are already set.
for _name in ("LANGCHAIN_TRACING_V2", "LANGCHAIN_TRACING", "LANGSMITH_TRACING", "LANGSMITH_TRACING_V2"):
    os.environ[_name] = "false"

import pytest
from langchain_core.messages import HumanMessage

import config
import tools.registry
from evals import fake_tools
from fake_llm import DRAFT_KINDS, ScriptedLLM
from graph import app
from models.conversation import ConversationMemory
from models.domain import Flow, ToolCallDraft
from models.state import AddressFields, AgentState, DraftRoute
from prompts.common import struct_schema_hint
from prompts.draft import ASK_MISSING, CANCEL_STEP, DRAFT_GATE, EXTRACT_ADDRESS, EXTRACT_ARGS
from tools import tool_for

GOLDEN_DIR = Path(__file__).parent / "golden"


@pytest.fixture
def llm(monkeypatch):
    """Every LLM call of the graph goes to this scripted LLM. No key or network is needed."""
    fake = ScriptedLLM()
    monkeypatch.setattr(config, "_model", fake)
    yield fake
    assert fake.unexpected == [], f"unexpected LLM calls: {[c.kind for c in fake.unexpected]}"
    assert fake.unused() == {}, f"scripted answers never asked for: {fake.unused()}"


@pytest.fixture
def shop(monkeypatch):
    """The fake shop from the evals answers the tool calls instead of back."""
    fake_tools.reset()
    monkeypatch.setattr(tools.registry, "call_tool", fake_tools.fake_call_tool)
    return fake_tools


@dataclass
class Turn:
    state: AgentState
    reply: str

    @property
    def notes(self) -> ConversationMemory:
        return self.state.conversation_memory

    @property
    def flow(self) -> Flow | None:
        notes = self.notes
        return next((f for f in notes.flows if f.flow_id == notes.active_flow_id), None)

    @property
    def draft(self) -> ToolCallDraft | None:
        return self.flow.tool_draft if self.flow else None


class Chat:
    """One conversation played turn by turn through the real graph."""

    def __init__(self) -> None:
        thread = uuid.uuid4().hex
        self._config = {"configurable": {"thread_id": thread, "store_key": thread}}

    def say(self, text: str) -> Turn:
        result = app.invoke({"messages": [HumanMessage(content=text)]}, config=self._config)
        state = AgentState.model_validate(result)
        return Turn(state, _reply_of(state.messages))


def _reply_of(messages: list) -> str:
    """The text of the last AI message of this turn, or an empty string."""
    for m in reversed(messages):
        if getattr(m, "type", "") == "human":
            break
        if getattr(m, "type", "") == "ai" and getattr(m, "content", ""):
            return m.content
    return ""


@pytest.fixture
def chat(llm, shop):
    return Chat()


def _expected_system(call) -> str:
    if call.kind == "gate":
        return DRAFT_GATE + struct_schema_hint(DraftRoute)
    if call.kind == "args":
        return EXTRACT_ARGS + struct_schema_hint(tool_for(call.payload()["tool"]).args_schema)
    if call.kind == "address":
        return EXTRACT_ADDRESS + struct_schema_hint(AddressFields)
    return {"ask": ASK_MISSING, "cancel": CANCEL_STEP}[call.kind]


@pytest.fixture
def golden(llm):
    """Compare the exact text the draft sent to the LLM with the saved file.

    Run with UPDATE_GOLDEN=1 to write the file. Only do that when the LLM input should change.
    """

    def check(name: str) -> None:
        calls = llm.calls_of(*DRAFT_KINDS)
        for call in calls:
            assert call.system == _expected_system(call), f"system prompt changed for {call.kind}"
        actual = [[c.kind, c.human] for c in calls]
        path = GOLDEN_DIR / f"{name}.json"
        if os.environ.get("UPDATE_GOLDEN"):
            GOLDEN_DIR.mkdir(exist_ok=True)
            path.write_text(json.dumps(actual, ensure_ascii=False, indent=1) + "\n")
        assert actual == json.loads(path.read_text())

    return check
