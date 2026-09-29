import json
import logging
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from flows import (
    ADDRESS_FIELD_DESCS, active_flow, flow_draft, prereqs_for, selected_product, sync_shipping,
    unfilled_prereqs,
)
from llm.structured import ask_json_dict, call_json, llm_phrase
from models.state import AddressFields, AgentState, DraftRoute
from prompts.common import struct_schema_hint
from prompts.draft import (
    ASK_MISSING, CANCEL_STEP, DRAFT_GATE, EXTRACT_ADDRESS, EXTRACT_ARGS, cancel_step_input,
)
from text.messages import last_user_text
from text.patterns import AFFIRM_RE, CANCEL_RE, NUM_RE
from tools import tool_for
from tools.schema import coerce_args, missing_fields, tool_schema_info

logger = logging.getLogger(__name__)


def _to_json(data: dict) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)


def _gate_direction(draft, text: str) -> str:
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


def draft_gate(state: AgentState) -> dict:
    direction = "normal"
    _, draft = flow_draft(state)
    if draft is not None and draft.status == "drafting":
        text = last_user_text(state.messages)
        direction = _gate_direction(draft, text)
    updates: dict[str, Any] = {"flow_direction": direction}
    if direction == "cancel":
        mem = state.conversation_memory.model_copy(deep=True)
        flow = active_flow(mem, state.resolved_flow_id)
        if flow is not None:
            flow.tool_draft = None
            flow.updated_at = datetime.now(timezone.utc)
        updates.update({
            "conversation_memory": mem,
            "needs_tool": False,
            "reply": llm_phrase(CANCEL_STEP, cancel_step_input(draft.tool_name, text)),
        })
    logger.info("draft_gate -> direction=%s draft=%s", direction, draft.tool_name if draft else None)
    return updates


def _extract_address(state: AgentState, mem, flow, draft, prereq_missing: list[str]) -> None:
    """Fill missing address prereqs from the customer text and save them to memory."""
    addr_human = _to_json({
        "customer_message": last_user_text(state.messages),
        "already_known": {f: getattr(mem.global_information, f, None) for f in ADDRESS_FIELD_DESCS},
    })
    addr_raw = ask_json_dict(
        EXTRACT_ADDRESS + struct_schema_hint(AddressFields), addr_human,
        "address extraction call failed (%s)",
    )
    for k in prereq_missing:
        v = addr_raw.get(k)
        if isinstance(v, (list, dict)):
            v = json.dumps(v)
        if v is not None and str(v).strip():
            draft.prereqs[k] = str(v).strip()
        else:
            draft.prereqs.setdefault(k, None)
    gi = mem.global_information
    if any(draft.prereqs.get(k) for k in ADDRESS_FIELD_DESCS):
        for k in ADDRESS_FIELD_DESCS:
            if draft.prereqs.get(k):
                setattr(gi, k, str(draft.prereqs[k]).strip())
        sync_shipping(flow, gi)
        logger.info("global address updated -> wilaya=%s commune=%s address=%s", gi.wilaya, gi.commune, gi.address)


def extract_tool_args(state: AgentState) -> dict:
    mem = state.conversation_memory.model_copy(deep=True)
    flow = active_flow(mem, state.resolved_flow_id)
    if flow is None or flow.tool_draft is None or flow.tool_draft.status != "drafting":
        return {}
    draft = flow.tool_draft
    t = tool_for(draft.tool_name)
    if t is None:
        return {}
    human = _to_json({
        "tool": draft.tool_name,
        "already_collected": draft.args,
        "missing_so_far": draft.missing,
        "selected_product": selected_product(flow),
        "customer_message": last_user_text(state.messages),
    })
    raw = ask_json_dict(
        EXTRACT_ARGS + struct_schema_hint(t.args_schema), human, "extract_tool_args call failed (%s)"
    )
    extracted = coerce_args(raw, draft.tool_name)
    before_args_missing = missing_fields(draft.args, draft.tool_name)
    before_prereq_missing = unfilled_prereqs(prereqs_for(draft.tool_name, mem))
    draft.args.update(extracted)

    prereq_missing = unfilled_prereqs(prereqs_for(draft.tool_name, mem))
    if prereq_missing:
        _extract_address(state, mem, flow, draft, prereq_missing)

    missing_args = missing_fields(draft.args, draft.tool_name)
    missing_prereqs = unfilled_prereqs(prereqs_for(draft.tool_name, mem))
    # Reset the counter whenever this turn made progress.
    if missing_args != before_args_missing or missing_prereqs != before_prereq_missing or extracted:
        draft.attempts = 0
    else:
        draft.attempts += 1
    draft.missing = missing_args + missing_prereqs
    if not draft.missing:
        draft.status = "ready"
    flow.updated_at = datetime.now(timezone.utc)
    logger.info(
        "extract_tool_args -> tool=%s extracted=%s prereqs=%s missing=%s status=%s attempts=%s",
        draft.tool_name, extracted, draft.prereqs, draft.missing, draft.status, draft.attempts,
    )
    return {"conversation_memory": mem}


def ask_reply(state: AgentState) -> dict:
    flow, draft = flow_draft(state)
    if draft is None or flow is None:
        return {}
    _, props = tool_schema_info(draft.tool_name)
    missing = draft.missing or missing_fields(draft.args, draft.tool_name)
    fields = [
        f"{name}: {props.get(name, {}).get('description') or name}"
        for name in missing
        if name in props
    ]
    known_gi = state.conversation_memory.global_information
    prereq_missing = unfilled_prereqs(prereqs_for(draft.tool_name, state.conversation_memory))
    fields.extend(f"{name}: {desc}" for name, desc in ADDRESS_FIELD_DESCS.items() if name in prereq_missing)
    human = _to_json({
        "task_tool": draft.tool_name,
        "missing_items": fields,
        "already_known": draft.args,
        "known_address": {f: getattr(known_gi, f, None) for f in ADDRESS_FIELD_DESCS},
        "selected_product": selected_product(flow),
        "customer_message": last_user_text(state.messages),
    })
    return {"needs_tool": False, "reply": llm_phrase(ASK_MISSING, human)}
