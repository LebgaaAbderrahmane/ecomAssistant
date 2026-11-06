from langchain_core.messages import ToolMessage

import nodes.calling as calling
from models.state import AgentState


def test_calling_tool_executes_structured_choice_without_second_llm_call(monkeypatch):
    seen = []

    def run_tools(ai_msg, **kwargs):
        seen.append((ai_msg, kwargs))
        return [ToolMessage(content='{"products": []}', **kwargs)]

    class NoModelCall:
        def bind_tools(self, tools):
            raise AssertionError("calling_tool asked the model to choose an already selected tool")

    monkeypatch.setattr(calling, "_run_tools", run_tools)
    monkeypatch.setattr(calling, "model", NoModelCall())

    result = calling.calling_tool(
        AgentState(
            messages=[],
            tool_calls=[{"name": "searchProducts", "arguments": {"product": "hoodie"}}],
        )
    )

    assert len(seen) == 1
    message, kwargs = seen[0]
    assert message.tool_calls[0]["name"] == "searchProducts"
    assert message.tool_calls[0]["args"] == {"product": "hoodie"}
    assert kwargs["name"] == "searchProducts"
    assert result["tool_outputs"] == ['{"products": []}']
