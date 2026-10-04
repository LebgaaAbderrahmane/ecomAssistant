"""A scripted LLM for tests. It answers by the kind of prompt it gets and records every call."""
import json
from dataclasses import dataclass

from langchain_core.messages import AIMessage

from prompts.draft import ASK_MISSING, CANCEL_STEP, DRAFT_GATE, EXTRACT_ADDRESS, EXTRACT_ARGS
from prompts.flow import FLOW_RULES
from prompts.reply import REPLY_FROM_TOOL

DRAFT_KINDS = ("gate", "args", "address", "ask", "cancel")


@dataclass
class Call:
    kind: str
    system: str
    human: str

    def payload(self) -> dict:
        return json.loads(self.human)


def kind_of(system: str) -> str:
    if system.startswith(DRAFT_GATE):
        return "gate"
    if system.startswith(EXTRACT_ARGS):
        return "args"
    if system.startswith(EXTRACT_ADDRESS):
        return "address"
    if system == ASK_MISSING:
        return "ask"
    if system == CANCEL_STEP:
        return "cancel"
    if system.startswith("You are the intent classifier"):
        return "check"
    if system.startswith("You pick the single best tool"):
        return "query"
    if system.startswith(FLOW_RULES):
        return "flow"
    if system == REPLY_FROM_TOOL:
        return "reply"
    return "other"


class ScriptedLLM:
    """Answers come from a queue per kind of prompt. A call with no answer left is recorded in `unexpected`.

    It does not raise: the nodes catch LLM errors and would hide the problem.
    """

    def __init__(self) -> None:
        self.calls: list[Call] = []
        self.unexpected: list[Call] = []
        self._queues: dict[str, list] = {}

    def script(self, kind: str, *answers) -> None:
        """An answer is a string, a dict (sent as JSON) or a function of the Call."""
        self._queues.setdefault(kind, []).extend(answers)

    def unused(self) -> dict[str, int]:
        return {kind: len(queue) for kind, queue in self._queues.items() if queue}

    def calls_of(self, *kinds: str) -> list[Call]:
        return [c for c in self.calls if c.kind in kinds]

    def _answer(self, call: Call) -> str:
        self.calls.append(call)
        queue = self._queues.get(call.kind)
        if not queue:
            self.unexpected.append(call)
            return "UNEXPECTED LLM CALL"
        answer = queue.pop(0)
        if callable(answer):
            answer = answer(call)
        return answer if isinstance(answer, str) else json.dumps(answer, ensure_ascii=False)

    def invoke(self, messages: list) -> AIMessage:
        call = Call(kind_of(str(messages[0].content)), str(messages[0].content), str(messages[-1].content))
        return AIMessage(content=self._answer(call))

    def bind_tools(self, tools, **kwargs) -> "_ToolCaller":
        return _ToolCaller(self)


class _ToolCaller:
    """The model with tools bound. Its answer is a tool call: {"name": ..., "args": {...}}."""

    def __init__(self, llm: ScriptedLLM) -> None:
        self._llm = llm

    def invoke(self, messages: list) -> AIMessage:
        call = Call("tools", str(messages[0].content), str(messages[-1].content))
        spec = json.loads(self._llm._answer(call))
        return AIMessage(
            content="",
            tool_calls=[{"name": spec["name"], "args": spec["args"], "id": "call-1", "type": "tool_call"}],
        )
