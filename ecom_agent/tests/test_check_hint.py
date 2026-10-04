from datetime import datetime, timezone

from models.conversation import ConversationMemory, GlobalInformation
from models.domain import Flow, FlowState
from models.state import AgentState
from nodes.check import _summarize_flows

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


def hint(**address) -> str:
    flow = Flow(flow_id="f1", state=FlowState.ORDER, created_at=NOW, updated_at=NOW)
    notes = ConversationMemory(flows=[flow], active_flow_id="f1", global_information=GlobalInformation(**address))
    return _summarize_flows(AgentState(messages=[], conversation_memory=notes))


def test_the_saved_address_is_shown_once_after_the_flows():
    text = hint(wilaya="Oran", address="Cité 200 logements")
    assert text.endswith('Saved delivery address: {"wilaya": "Oran", "address": "Cité 200 logements"}')
    assert text.count("Saved delivery address") == 1


def test_no_address_line_when_the_notes_have_no_address():
    assert "Saved delivery address" not in hint()


def test_no_flows_gives_no_hint():
    assert _summarize_flows(AgentState(messages=[], conversation_memory=ConversationMemory())) == ""
