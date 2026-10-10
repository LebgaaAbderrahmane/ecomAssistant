"""The drafts module on its own. The LLM is passed in; no graph runs here."""
from datetime import datetime, timezone

import pytest

import config
import drafts
from fake_llm import ScriptedLLM
from models.conversation import ConversationMemory, GlobalInformation
from models.domain import Flow, FlowState, ToolCallDraft
from prompts.common import ASK_MORE_INFO

NOW = datetime(2026, 10, 1, tzinfo=timezone.utc)


@pytest.fixture(autouse=True)
def global_llm_is_never_used(monkeypatch):
    other = ScriptedLLM()
    monkeypatch.setattr(config, "_model", other)
    yield
    assert other.calls == [], "drafts must use the LLM it is given, not the global one"


@pytest.fixture
def model():
    fake = ScriptedLLM()
    yield fake
    assert fake.unexpected == []
    assert fake.unused() == {}


def notes_with(tool: str | None = "createOrder", args=None, status="drafting", missing=None, **address):
    draft = ToolCallDraft(tool_name=tool, args=args or {}, status=status, missing=missing or []) if tool else None
    flow = Flow(flow_id="f1", state=FlowState.ORDER, created_at=NOW, updated_at=NOW, tool_draft=draft)
    notes = ConversationMemory(
        flows=[flow], active_flow_id="f1", global_information=GlobalInformation(**address),
    )
    return notes, flow


ORDER = {"productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir"}


def test_tests_never_send_traces_to_langsmith():
    from langsmith.utils import tracing_is_enabled

    assert not tracing_is_enabled()


def test_state_is_none_collecting_or_ready():
    assert drafts.state_of(notes_with(None)[0], None) == "none"
    assert drafts.state_of(ConversationMemory(), None) == "none"
    assert drafts.state_of(notes_with()[0], None) == "collecting"
    assert drafts.state_of(notes_with(status="ready")[0], None) == "ready"


def test_start_opens_a_draft_and_keeps_one_for_the_same_tool():
    _, flow = notes_with(None)
    drafts.start(flow, "createOrder")
    assert flow.tool_draft.tool_name == "createOrder"

    flow.tool_draft.args["quantity"] = 2
    drafts.start(flow, "createOrder")
    assert flow.tool_draft.args == {"quantity": 2}

    drafts.start(flow, "calculateShipping")
    assert flow.tool_draft.tool_name == "calculateShipping"
    assert flow.tool_draft.args == {}

    drafts.start(flow, "")
    assert flow.tool_draft.tool_name == "calculateShipping"


class TestGate:
    def test_no_draft_means_a_normal_message(self, model):
        notes, _ = notes_with(None)
        assert drafts.gate(notes, None, "salam", model) == drafts.Gate("normal", "")

    def test_a_number_or_a_yes_continues_without_asking_the_llm(self, model):
        notes, _ = notes_with()
        assert drafts.gate(notes, None, "2", model).direction == "continue"
        assert drafts.gate(notes, None, "ok", model).direction == "continue"

    def test_cancel_removes_the_draft_and_writes_the_cancel_text(self, model):
        notes, flow = notes_with(args={"quantity": 1})
        model.script("cancel", "ok, cancelled")
        result = drafts.gate(notes, None, "khaleh", model)
        assert (result.direction, result.reply) == ("cancel", "ok, cancelled")
        assert result.notes.flows[0].tool_draft is None
        assert flow.tool_draft is not None  # the notes that were passed in are not changed
        assert model.calls[0].human == "Cancelling step (createOrder). Customer said: khaleh"

    def test_other_messages_are_decided_by_the_llm(self, model):
        notes, flow = notes_with()
        model.script("gate", {"decision": "new_request"}, {"decision": "continue_draft"}, "garbage", "garbage")
        assert drafts.gate(notes, None, "chhal livraison?", model).direction == "normal"
        assert drafts.gate(notes, None, "Oran", model).direction == "continue"
        # An answer that is not JSON is a new request.
        assert drafts.gate(notes, None, "hmm", model).direction == "normal"
        assert flow.tool_draft is not None


class TestCollect:
    def test_nothing_to_collect_without_a_collecting_draft(self, model):
        assert drafts.collect(notes_with(None)[0], None, "Oran", model) is False
        assert drafts.collect(notes_with(status="ready")[0], None, "Oran", model) is False

    def test_the_draft_is_ready_when_everything_is_known(self, model):
        notes, flow = notes_with(args={"productId": "p1", "quantity": 1}, wilaya="Oran", commune="Bir El Djir",
                                 address="Cité 200 logements")
        model.script("args", {"wilaya": "Oran", "commune": "Bir El Djir", "quantity": "1"})
        assert drafts.collect(notes, None, "Oran, Bir El Djir", model) is True
        assert flow.tool_draft.status == "ready"
        assert flow.tool_draft.missing == []
        assert flow.tool_draft.args["quantity"] == 1  # cast to the type of the tool schema

    def test_address_words_go_to_the_notes(self, model):
        notes, flow = notes_with(args=ORDER)
        model.script("args", {})
        model.script("address", {"wilaya": "Oran", "commune": "Bir El Djir", "address": "Cité 200 logements"})
        drafts.collect(notes, None, "Oran, Bir El Djir, Cité 200 logements", model)
        gi = notes.global_information
        assert (gi.wilaya, gi.commune, gi.address) == ("Oran", "Bir El Djir", "Cité 200 logements")
        assert flow.tool_draft.status == "ready"

    def test_only_the_missing_address_fields_are_filled(self, model):
        notes, _ = notes_with(args=ORDER, wilaya="Oran", commune="Bir El Djir")
        model.script("args", {})
        model.script("address", {"wilaya": "Alger", "address": "Cité 200 logements"})
        drafts.collect(notes, None, "Alger, Cité 200 logements", model)
        gi = notes.global_information
        assert (gi.wilaya, gi.commune, gi.address) == ("Oran", "Bir El Djir", "Cité 200 logements")

    def test_a_new_wilaya_and_commune_make_the_saved_street_missing(self, model):
        notes, flow = notes_with(args={"productId": "p1", "quantity": 1}, wilaya="Oran", commune="Bir El Djir",
                                 address="Cité 200 logements")
        model.script("args", {"wilaya": "Alger", "commune": "Bab Ezzouar"})
        model.script("address", {})
        drafts.collect(notes, None, "ship it to Alger, Bab Ezzouar", model)
        gi = notes.global_information
        assert (gi.wilaya, gi.commune, gi.address) == ("Alger", "Bab Ezzouar", None)
        assert flow.tool_draft.status == "drafting"
        assert flow.tool_draft.missing == ["address"]

    def test_the_same_wilaya_and_commune_keep_the_saved_street(self, model):
        notes, flow = notes_with(args={"productId": "p1", "quantity": 1}, wilaya="Béjaïa", commune="Bir El Djir",
                                 address="Cité 200 logements")
        model.script("args", {"wilaya": " bejaia", "commune": "bir el  djir"})
        drafts.collect(notes, None, "same address", model)
        gi = notes.global_information
        assert (gi.wilaya, gi.commune, gi.address) == ("Béjaïa", "Bir El Djir", "Cité 200 logements")
        assert flow.tool_draft.status == "ready"

    def test_dashes_and_apostrophes_do_not_make_a_new_commune(self, model):
        notes, flow = notes_with(args={"productId": "p1", "quantity": 1}, wilaya="Bordj Bou Arréridj",
                                 commune="M'sila", address="Cité 200 logements")
        model.script("args", {"wilaya": "Bordj-Bou-Arreridj", "commune": "M’sila"})
        drafts.collect(notes, None, "same", model)
        assert notes.global_information.address == "Cité 200 logements"
        assert flow.tool_draft.status == "ready"

    def test_a_new_wilaya_commune_and_street_in_one_message(self, model):
        notes, flow = notes_with(args={"productId": "p1", "quantity": 1}, wilaya="Oran", commune="Bir El Djir",
                                 address="Cité 200 logements")
        model.script("args", {"wilaya": "Alger", "commune": "Bab Ezzouar"})
        model.script("address", {"address": "Rue 5"})
        drafts.collect(notes, None, "Alger, Bab Ezzouar, Rue 5", model)
        assert flow.tool_draft.status == "ready"
        assert drafts.ready_call(notes, None).args["address"] == "Rue 5"

    def test_an_old_street_in_the_arguments_does_not_follow_a_new_commune(self, model):
        notes, flow = notes_with(args={**ORDER, "address": "Rue Old"}, wilaya="Oran", commune="Bir El Djir",
                                 address="Rue Old")
        model.script("args", {"wilaya": "Alger", "commune": "Bab Ezzouar"})
        model.script("address", {})
        drafts.collect(notes, None, "ship it to Alger, Bab Ezzouar", model)
        assert "address" not in flow.tool_draft.args
        assert flow.tool_draft.missing == ["address"]

        model.script("args", {})
        model.script("address", {"address": "Rue New"})
        drafts.collect(notes, None, "Rue New", model)
        assert drafts.ready_call(notes, None).args["address"] == "Rue New"

    def test_a_street_in_the_arguments_is_saved_in_the_notes(self, model):
        notes, flow = notes_with(args=ORDER, wilaya="Oran", commune="Bir El Djir", address="Rue Old")
        model.script("args", {"address": "Rue New"})
        drafts.collect(notes, None, "no, Rue New", model)
        assert notes.global_information.address == "Rue New"
        assert drafts.ready_call(notes, None).args["address"] == "Rue New"

    def test_a_corrected_wilaya_is_saved_in_the_notes(self, model):
        notes, flow = notes_with(args=ORDER, wilaya="Oran", commune="Bir El Djir")
        model.script("args", {"wilaya": "Alger"})
        model.script("address", {})
        drafts.collect(notes, None, "no, Alger", model)
        assert notes.global_information.wilaya == "Alger"
        assert flow.tool_draft.args["wilaya"] == "Alger"

    def test_a_first_wilaya_and_commune_drop_nothing(self, model):
        notes, _ = notes_with(args={"productId": "p1", "quantity": 1}, address="Cité 200 logements")
        model.script("args", {"wilaya": "Oran", "commune": "Bir El Djir"})
        drafts.collect(notes, None, "Oran, Bir El Djir", model)
        gi = notes.global_information
        assert (gi.wilaya, gi.commune, gi.address) == ("Oran", "Bir El Djir", "Cité 200 logements")

    def test_other_tools_do_not_touch_the_saved_address(self, model):
        notes, _ = notes_with("calculateShipping", wilaya="Oran", commune="Bir El Djir", address="Cité 200 logements")
        model.script("args", {"wilaya": "Alger"})
        drafts.collect(notes, None, "and to Alger?", model)
        gi = notes.global_information
        assert (gi.wilaya, gi.commune, gi.address) == ("Oran", "Bir El Djir", "Cité 200 logements")

    def test_attempts_count_only_turns_without_progress(self, model):
        notes, flow = notes_with(args={"productId": "p1", "quantity": 1}, wilaya="Oran", commune="Bir El Djir")
        model.script("args", {}, {}, {"wilaya": "Oran"})
        model.script("address", {}, {}, {})
        drafts.collect(notes, None, "wa7da", model)
        drafts.collect(notes, None, "wa7da", model)
        assert flow.tool_draft.attempts == 2
        drafts.collect(notes, None, "Oran", model)
        assert flow.tool_draft.attempts == 0


class TestAsk:
    def test_no_question_without_a_draft(self, model):
        assert drafts.ask(notes_with(None)[0], None, "hi", model) is None

    def test_the_question_comes_from_the_llm(self, model):
        notes, _ = notes_with(args={"productId": "p1", "quantity": 1}, missing=["wilaya", "commune"])
        model.script("ask", "Quelle wilaya ?")
        assert drafts.ask(notes, None, "nheb nchriha", model) == "Quelle wilaya ?"

    def test_an_empty_answer_gives_the_fallback_question(self, model):
        notes, _ = notes_with(missing=["wilaya"])
        model.script("ask", "")
        assert drafts.ask(notes, None, "hi", model) == ASK_MORE_INFO


class TestReadyCall:
    def test_none_while_the_draft_is_collecting(self):
        assert drafts.ready_call(notes_with(args=ORDER)[0], None) is None
        assert drafts.ready_call(notes_with(None)[0], None) is None

    def test_the_street_comes_from_the_notes(self):
        notes, _ = notes_with(args=ORDER, status="ready", address="Cité 200 logements")
        assert drafts.ready_call(notes, None) == drafts.ReadyCall("createOrder", {**ORDER, "address": "Cité 200 logements"})

    def test_a_street_in_the_arguments_wins(self):
        notes, _ = notes_with(args={**ORDER, "address": "Rue 5"}, status="ready", address="Cité 200 logements")
        assert drafts.ready_call(notes, None).args["address"] == "Rue 5"

    def test_other_tools_get_no_address(self):
        notes, _ = notes_with("calculateShipping", {"wilaya": "Oran"}, "ready", address="Cité 200 logements")
        assert drafts.ready_call(notes, None).args == {"wilaya": "Oran"}

    def test_close_removes_the_draft(self):
        notes, flow = notes_with(args=ORDER, status="ready")
        drafts.close(notes, None)
        assert flow.tool_draft is None
        assert flow.updated_at > NOW
