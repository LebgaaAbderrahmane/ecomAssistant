"""The settings that make a retry safe: the idempotency key to back, and the LLM time limits."""
import pytest

import tools.grpc
from grpc_gen.tools.v1 import tool_pb2
from llm.client import build_client


class FakeStub:
    def __init__(self) -> None:
        self.requests: list = []

    def ExecuteTool(self, request, metadata=None):
        self.requests.append(request)
        return tool_pb2.ExecuteToolResponse(success=True, data_json="{}")


def test_call_tool_sends_the_message_id_as_the_idempotency_key(monkeypatch):
    stub = FakeStub()
    monkeypatch.setattr(tools.grpc, "_get_stub", lambda: stub)

    with tools.grpc.tool_identity(conversation_id="c1", merchant_id="mer1", customer_id="cus1", message_id="m42"):
        tools.grpc.call_tool("createOrder", {"quantity": 1})

    assert stub.requests[0].idempotency_key == "m42"
    assert stub.requests[0].identity.conversation_id == "c1"


def test_call_tool_without_a_message_id_sends_an_empty_key(monkeypatch):
    stub = FakeStub()
    monkeypatch.setattr(tools.grpc, "_get_stub", lambda: stub)

    with tools.grpc.tool_identity(conversation_id="c1"):
        tools.grpc.call_tool("searchProducts", {})

    assert stub.requests[0].idempotency_key == ""


def test_both_llm_clients_have_a_time_limit_and_no_library_retries(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test")
    monkeypatch.setenv("GOOGLE_API_KEY", "test")
    monkeypatch.setenv("LLM_PROVIDER", "groq,gemini")
    monkeypatch.delenv("LLM_TIMEOUT_SECONDS", raising=False)
    monkeypatch.delenv("LLM_MAX_RETRIES", raising=False)

    client = build_client()

    models = dict(client._models)
    assert models["groq"].request_timeout == 20
    assert models["groq"].max_retries == 0
    assert models["gemini"].timeout == 20
    assert models["gemini"].max_retries == 0


def test_the_time_limit_comes_from_the_environment(monkeypatch):
    monkeypatch.setenv("GROQ_API_KEY", "test")
    monkeypatch.setenv("LLM_PROVIDER", "groq")
    monkeypatch.setenv("LLM_TIMEOUT_SECONDS", "7")

    client = build_client()

    assert dict(client._models)["groq"].request_timeout == 7
