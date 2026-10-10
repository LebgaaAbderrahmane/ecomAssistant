"""The Draft: a tool call the agent is still filling in. A Flow holds at most one.

It is ready when every tool argument is known and, for createOrder, the delivery address is in the notes.
The LLM is an argument. The graph step names are not known here.
"""
import json
import logging
import re
import unicodedata
from datetime import datetime, timezone
from typing import Any, Literal, NamedTuple

from langchain_core.messages import HumanMessage, SystemMessage

from flows import active_flow, selected_product
from llm.structured import ask_json_dict, call_json, llm_phrase
from models.conversation import ConversationMemory
from models.domain import Flow, ToolCallDraft
from models.state import AddressFields, DraftRoute
from prompts.common import struct_schema_hint
from prompts.draft import (
    ASK_MISSING, CANCEL_STEP, DRAFT_GATE, EXTRACT_ADDRESS, EXTRACT_ARGS, cancel_step_input,
)
from text.patterns import AFFIRM_RE, CANCEL_RE, NUM_RE
from tools import tool_for
from tools.schema import coerce_args, missing_fields, tool_schema_info

logger = logging.getLogger(__name__)

State = Literal["none", "collecting", "ready"]
Direction = Literal["normal", "continue", "cancel"]

ADDRESS_FIELD_DESCS = {
    "wilaya": "the wilaya (province) to ship to",
    "commune": "the commune (city/town) to ship to",
    "address": "the street or detailed delivery address",
}

# Stalled Turns in a row before the agent hands over to a human.
MAX_STALLED_TURNS = 3


class Gate(NamedTuple):
    direction: Direction
    reply: str = ""  # the cancel text
    notes: ConversationMemory | None = None  # a copy without the Draft, only on a cancel


class ReadyCall(NamedTuple):
    tool_name: str
    args: dict[str, Any]


def _to_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _find(notes: ConversationMemory, flow_id: str | None) -> tuple[Flow, ToolCallDraft] | None:
    flow = active_flow(notes, flow_id)
    if flow is None or flow.tool_draft is None:
        return None
    return flow, flow.tool_draft


def _state(draft: ToolCallDraft | None) -> State:
    if draft is None:
        return "none"
    return "ready" if draft.status == "ready" else "collecting"


def _missing_address(tool_name: str, notes: ConversationMemory) -> list[str]:
    """Only createOrder needs the address."""
    if tool_name != "createOrder":
        return []
    gi = notes.global_information
    return [f for f in ADDRESS_FIELD_DESCS if not getattr(gi, f, None)]


def _name_key(name: str) -> str:
    """The same wilaya or commune can be written in many ways ("Béjaïa", "bejaia"). They get the same key."""
    decomposed = unicodedata.normalize("NFKD", name)
    no_accents = "".join(c for c in decomposed if not unicodedata.combining(c))
    words = re.sub(r"[-'’]", " ", no_accents.casefold())
    return " ".join(words.split())


def _sync_address(notes: ConversationMemory, draft: ToolCallDraft, extracted: dict[str, Any]) -> None:
    """The notes keep the latest delivery address from this turn's arguments.
    A new wilaya or commune makes the saved street wrong, so the street is dropped and asked again."""
    if draft.tool_name != "createOrder":
        return
    gi = notes.global_information
    moved = False
    for field in ("wilaya", "commune"):
        new = str(extracted.get(field) or "").strip()
        old = getattr(gi, field)
        if not new or (old and _name_key(old) == _name_key(new)):
            continue
        moved = moved or bool(old)
        setattr(gi, field, new)
    if moved:
        gi.address = None
        if not extracted.get("address"):
            draft.args.pop("address", None)
    street = str(extracted.get("address") or "").strip()
    if street:
        gi.address = street


def state_of(notes: ConversationMemory, flow_id: str | None) -> State:
    found = _find(notes, flow_id)
    return _state(found[1] if found else None)


def start(flow: Flow, tool_name: str) -> None:
    """A Draft for the same tool stays, so it keeps what it already collected."""
    draft = flow.tool_draft
    if tool_name and (draft is None or draft.tool_name != tool_name):
        flow.tool_draft = ToolCallDraft(tool_name=tool_name)


def _direction(draft: ToolCallDraft, text: str, model) -> Direction:
    low = text.lower()
    if CANCEL_RE.search(low):
        return "cancel"
    if NUM_RE.search(low) or AFFIRM_RE.search(low):
        return "continue"
    payload = _to_json({
        "pending_tool": draft.tool_name,
        "missing_arguments": draft.missing,
        "already_collected": draft.args,
        "customer_message": text,
    })
    dec = call_json(
        model,
        DraftRoute,
        DraftRoute(decision="new_request"),
        [SystemMessage(content=DRAFT_GATE + struct_schema_hint(DraftRoute)), HumanMessage(content=payload)],
    )
    return {"continue_draft": "continue", "cancel": "cancel", "new_request": "normal"}.get(
        dec.decision, "normal"
    )


def gate(notes: ConversationMemory, flow_id: str | None, text: str, model) -> Gate:
    """Does not change `notes`. On a cancel, the result holds a copy of them without the Draft."""
    found = _find(notes, flow_id)
    draft = found[1] if found else None
    direction: Direction = "normal"
    if _state(draft) == "collecting":
        direction = _direction(draft, text, model)
    result = Gate(direction)
    if direction == "cancel":
        changed = notes.model_copy(deep=True)
        close(changed, flow_id)
        result = Gate(direction, llm_phrase(model, CANCEL_STEP, cancel_step_input(draft.tool_name, text)), changed)
    logger.info("draft_gate -> direction=%s draft=%s", direction, draft.tool_name if draft else None)
    return result


def _collect_address(notes: ConversationMemory, text: str, missing: list[str], model) -> None:
    human = _to_json({
        "customer_message": text,
        "already_known": {f: getattr(notes.global_information, f, None) for f in ADDRESS_FIELD_DESCS},
    })
    raw = ask_json_dict(
        model, EXTRACT_ADDRESS + struct_schema_hint(AddressFields), human,
        "address extraction call failed (%s)",
    )
    gi = notes.global_information
    found = False
    for k in missing:
        v = raw.get(k)
        if isinstance(v, (list, dict)):
            v = json.dumps(v)
        if v is not None and str(v).strip():
            setattr(gi, k, str(v).strip())
            found = True
    if found:
        logger.info("global address updated -> wilaya=%s commune=%s address=%s", gi.wilaya, gi.commune, gi.address)


def collect(notes: ConversationMemory, flow_id: str | None, text: str, model) -> bool:
    """Changes `notes`, so pass a copy. False when there is nothing to collect."""
    found = _find(notes, flow_id)
    if found is None or _state(found[1]) != "collecting":
        return False
    flow, draft = found
    tool = tool_for(draft.tool_name)
    if tool is None:
        return False
    human = _to_json({
        "tool": draft.tool_name,
        "already_collected": draft.args,
        "missing_so_far": draft.missing,
        "selected_product": selected_product(flow),
        "customer_message": text,
    })
    raw = ask_json_dict(
        model, EXTRACT_ARGS + struct_schema_hint(tool.args_schema), human, "extract_tool_args call failed (%s)",
    )
    extracted = coerce_args(raw, draft.tool_name)
    before_args_missing = missing_fields(draft.args, draft.tool_name)
    before_address_missing = _missing_address(draft.tool_name, notes)
    draft.args.update(extracted)
    _sync_address(notes, draft, extracted)

    address_missing = _missing_address(draft.tool_name, notes)
    if address_missing:
        _collect_address(notes, text, address_missing, model)

    missing_args = missing_fields(draft.args, draft.tool_name)
    missing_now = _missing_address(draft.tool_name, notes)
    # Reset the counter whenever this turn made progress.
    if missing_args != before_args_missing or missing_now != before_address_missing or extracted:
        draft.attempts = 0
    else:
        draft.attempts += 1
    draft.missing = missing_args + missing_now
    if not draft.missing:
        draft.status = "ready"
    flow.updated_at = datetime.now(timezone.utc)
    logger.info(
        "extract_tool_args -> tool=%s extracted=%s missing=%s status=%s attempts=%s",
        draft.tool_name, extracted, draft.missing, draft.status, draft.attempts,
    )
    return True


def ask(notes: ConversationMemory, flow_id: str | None, text: str, model) -> str | None:
    found = _find(notes, flow_id)
    if found is None:
        return None
    flow, draft = found
    _, props = tool_schema_info(draft.tool_name)
    missing = draft.missing or missing_fields(draft.args, draft.tool_name)
    fields = [
        f"{name}: {props.get(name, {}).get('description') or name}"
        for name in missing
        if name in props
    ]
    address_missing = _missing_address(draft.tool_name, notes)
    fields.extend(f"{name}: {desc}" for name, desc in ADDRESS_FIELD_DESCS.items() if name in address_missing)
    known = notes.global_information
    human = _to_json({
        "task_tool": draft.tool_name,
        "missing_items": fields,
        "already_known": draft.args,
        "known_address": {f: getattr(known, f, None) for f in ADDRESS_FIELD_DESCS},
        "selected_product": selected_product(flow),
        "customer_message": text,
    })
    return llm_phrase(model, ASK_MISSING, human)


def ready_call(notes: ConversationMemory, flow_id: str | None) -> ReadyCall | None:
    found = _find(notes, flow_id)
    if found is None or _state(found[1]) != "ready":
        return None
    draft = found[1]
    args = dict(draft.args)
    # The street is saved in the notes, not collected as a draft argument.
    address = notes.global_information.address
    if draft.tool_name == "createOrder" and not args.get("address") and address:
        args["address"] = address
    return ReadyCall(draft.tool_name, args)


def close(notes: ConversationMemory, flow_id: str | None) -> None:
    found = _find(notes, flow_id)
    if found is not None:
        flow = found[0]
        flow.tool_draft = None
        flow.updated_at = datetime.now(timezone.utc)


def give_up(notes: ConversationMemory, flow_id: str | None) -> str | None:
    """Changes `notes`, so pass a copy. When the customer stalled the Draft too often, removes it
    and returns the reason for the human. Otherwise None."""
    found = _find(notes, flow_id)
    if found is None:
        return None
    draft = found[1]
    if _state(draft) != "collecting" or draft.attempts < MAX_STALLED_TURNS:
        return None
    missing = ", ".join(dict.fromkeys(draft.missing))
    close(notes, flow_id)
    return f"[stalledDraft] {draft.tool_name} is stuck after {draft.attempts} turns with nothing new. Missing: {missing}"
