"""ProcessMessage when back sends the same message again."""
import threading

import grpc
from langchain_core.messages import AIMessage, HumanMessage
from langgraph.store.memory import InMemoryStore

import server
from grpc_gen.agent.v1 import agent_pb2
from tools.grpc import get_identity
from turn_guard import TurnGuard

WAIT = 5


class FakeContext:
    def __init__(self) -> None:
        self.code = None
        self.details = ""

    def invocation_metadata(self):
        return [("authorization", f"Bearer {server.INTERNAL_API_KEY}")]

    def set_code(self, code) -> None:
        self.code = code

    def set_details(self, details: str) -> None:
        self.details = details


class FakeApp:
    """Stands in for the graph. It counts the runs and records the tool identity of each."""

    def __init__(self, reply: str = "Your order is made", fail: bool = False) -> None:
        self.reply = reply
        self.fail = fail
        self.identities: list[dict] = []
        self.started = threading.Event()
        self.release = threading.Event()
        self.release.set()

    def invoke(self, inputs, config):
        self.identities.append(dict(get_identity()))
        self.started.set()
        assert self.release.wait(WAIT)
        if self.fail:
            raise RuntimeError("the graph failed")
        return {"messages": [inputs["messages"][0], AIMessage(content=self.reply)]}


def request(message_id: str = "m1", conversation_id: str = "c1"):
    return agent_pb2.ProcessMessageRequest(
        message_id=message_id,
        conversation_id=conversation_id,
        merchant_id="mer1",
        customer_id="cus1",
    )


def make_service(app: FakeApp, monkeypatch, lock_timeout: float = WAIT) -> server.AgentService:
    monkeypatch.setattr(
        server,
        "get_message",
        lambda message_id: {"role": "customer", "text": "yes, order it", "conversationId": "c1"},
    )
    return server.AgentService(app, TurnGuard(InMemoryStore(), lock_timeout=lock_timeout))


def test_a_retried_message_runs_the_graph_once_and_gets_the_same_reply(monkeypatch):
    app = FakeApp()
    service = make_service(app, monkeypatch)

    first = service.ProcessMessage(request(), FakeContext())
    second = service.ProcessMessage(request(), FakeContext())

    assert len(app.identities) == 1
    assert first == second
    assert first.decision == agent_pb2.ProcessMessageResponse.DECISION_REPLY
    assert first.text == "Your order is made"


def test_the_tool_calls_of_a_turn_carry_the_message_id_as_the_idempotency_key(monkeypatch):
    app = FakeApp()
    service = make_service(app, monkeypatch)

    service.ProcessMessage(request(message_id="m42"), FakeContext())

    assert app.identities[0]["message_id"] == "m42"
    assert app.identities[0]["conversation_id"] == "c1"


def test_a_busy_conversation_answers_unavailable_so_back_retries(monkeypatch):
    app = FakeApp()
    app.release.clear()
    service = make_service(app, monkeypatch, lock_timeout=0.3)
    first = threading.Thread(target=service.ProcessMessage, args=(request("m1"), FakeContext()))
    first.start()
    assert app.started.wait(WAIT)

    context = FakeContext()
    response = service.ProcessMessage(request("m2"), context)

    assert context.code == grpc.StatusCode.UNAVAILABLE
    assert response.text == ""
    assert len(app.identities) == 1
    app.release.set()
    first.join(WAIT)


def test_a_failed_graph_escalates(monkeypatch):
    service = make_service(FakeApp(fail=True), monkeypatch)

    response = service.ProcessMessage(request(), FakeContext())

    assert response.decision == agent_pb2.ProcessMessageResponse.DECISION_ESCALATE


def test_a_message_that_is_not_from_a_customer_skips_the_guard(monkeypatch):
    app = FakeApp()
    service = make_service(app, monkeypatch)
    monkeypatch.setattr(server, "get_message", lambda message_id: {"role": "ai", "text": "hi", "conversationId": "c1"})

    response = service.ProcessMessage(request(), FakeContext())

    assert response.decision == agent_pb2.ProcessMessageResponse.DECISION_REPLY
    assert app.identities == []
