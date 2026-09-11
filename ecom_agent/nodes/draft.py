import json
import logging
import re as _re
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from config import model
from models.state import AgentState, AddressFields, DraftRoute
from models.domain import (
    Flow, ToolCallDraft, ShippingContext, ProductDiscoveryInput,
    ProductDiscoveryContext, Product, FlowState, Filter,
)
from models.conversation import ConversationMemory
from tools import tool_for, TOOL_NAMES
from utils import (
    _NUM_RE, _AFFIRM_RE, _CANCEL_RE,
    content_text, last_user_text, parse_json_dict, call_json, struct_schema_hint, llm_phrase,
)

logger = logging.getLogger(__name__)

SCHEMA_CACHE: dict[str, tuple[list[str], dict[str, Any]]] = {}

ADDRESS_FIELD_DESCS = {
    "wilaya": "the wilaya (province) to ship to",
    "commune": "the commune (city/town) to ship to",
    "address": "the street or detailed delivery address",
}


# ============================================================
# Schema introspection helpers
# ============================================================

def _tool_schema_info(tool_name: str) -> tuple[list[str], dict[str, Any]]:
    if tool_name in SCHEMA_CACHE:
        return SCHEMA_CACHE[tool_name]
    required: list[str] = []
    props: dict[str, Any] = {}
    try:
        t = tool_for(tool_name)
        schema = t.args_schema.model_json_schema()
        required = list(schema.get("required", []))
        props = schema.get("properties", {})
    except Exception as e:
        logger.warning("Could not introspect schema for %s: %s", tool_name, e)
    SCHEMA_CACHE[tool_name] = (required, props)
    return required, props


def _coerce_args(raw: dict[str, Any], tool_name: str) -> dict[str, Any]:
    _, props = _tool_schema_info(tool_name)
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if k not in props or v is None or v == "":
            continue
        t = props[k].get("type")
        try:
            if t == "integer":
                out[k] = int(float(v))
            elif t == "number":
                out[k] = float(v)
            elif t == "boolean":
                if isinstance(v, bool):
                    out[k] = v
                elif str(v).lower() in ("true", "1"):
                    out[k] = True
                elif str(v).lower() in ("false", "0"):
                    out[k] = False
                else:
                    continue
            else:
                out[k] = str(v).strip()
        except (ValueError, TypeError):
            continue
    return out


def _field_missing(args: dict[str, Any], tool_name: str) -> list[str]:
    required, _ = _tool_schema_info(tool_name)
    return [f for f in required if args.get(f) is None or args.get(f) == ""]


def _prereqs_for(tool_name: str, mem: ConversationMemory) -> dict[str, Any]:
    if tool_name != "createOrder":
        return {}
    gi = mem.global_information
    prereqs: dict[str, Any] = {}
    for f in ADDRESS_FIELD_DESCS:
        if not getattr(gi, f, None):
            prereqs[f] = None
    return prereqs


def _missing_prereqs(prereqs: dict[str, Any]) -> list[str]:
    return [k for k, v in prereqs.items() if v is None or v == ""]


def _active_flow(mem: ConversationMemory, resolved_flow_id: str | None) -> Flow | None:
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def _flow_draft(state: AgentState) -> tuple[Flow | None, ToolCallDraft | None]:
    flow = _active_flow(state.conversation_memory, state.resolved_flow_id)
    return flow, (flow.tool_draft if flow else None)


# ============================================================
# Nodes
# ============================================================

def draft_gate(state: AgentState) -> dict:
    from utils import _NUM_RE as _NR, _AFFIRM_RE as _AR, _CANCEL_RE as _CR

    direction = "normal"
    _, draft = _flow_draft(state)
    if draft is not None and draft.status == "drafting":
        text = last_user_text(state.messages)
        low = text.lower()
        if _CR.search(low):
            direction = "cancel"
        elif _NR.search(low) or _AR.search(low):
            direction = "continue"
        else:
            system = (
                "A tool call is partially filled and we are waiting for missing arguments from the "
                "customer. Decide whether the incoming customer message is:\n"
                "- continue_draft: answering the pending question (providing one of the missing values, "
                "or affirming it)\n"
                "- cancel: abandoning/cancelling the pending step\n"
                "- new_request: an unrelated or new request\n"
                + struct_schema_hint(DraftRoute)
            )
            payload = json.dumps({
                "pending_tool": draft.tool_name,
                "missing_arguments": draft.missing,
                "already_collected": draft.args,
                "customer_message": text,
            }, ensure_ascii=False, default=str)
            dec = call_json(
                model,
                DraftRoute,
                DraftRoute(decision="new_request"),
                [SystemMessage(content=system), HumanMessage(content=payload)],
            )
            direction = {
                "continue_draft": "continue",
                "cancel": "cancel",
                "new_request": "normal",
            }.get(dec.decision, "normal")
    updates: dict[str, Any] = {"flow_direction": direction}
    if direction == "cancel":
        mem = state.conversation_memory.model_copy(deep=True)
        flow = _active_flow(mem, state.resolved_flow_id)
        if flow is not None:
            flow.tool_draft = None
            flow.updated_at = datetime.now(timezone.utc)
        updates.update({
            "conversation_memory": mem,
            "needs_tool": False,
            "reply": llm_phrase(
                "You are a helpful e-commerce assistant. Briefly and kindly confirm that you are "
                "cancelling the step in progress. Match the customer's language.",
                f"Cancelling step ({draft.tool_name}). Customer said: {text}",
            ),
        })
    logger.info("draft_gate -> direction=%s draft=%s", direction, draft.tool_name if draft else None)
    return updates


def extract_tool_args(state: AgentState) -> dict:
    mem = state.conversation_memory.model_copy(deep=True)
    flow = _active_flow(mem, state.resolved_flow_id)
    if flow is None or flow.tool_draft is None or flow.tool_draft.status != "drafting":
        return {}
    draft = flow.tool_draft
    t = tool_for(draft.tool_name, flow)
    if t is None:
        return {}
    selected = None
    if flow.product_discovery is not None and flow.product_discovery.selected_product is not None:
        selected = flow.product_discovery.selected_product.model_dump()
    system = (
        "You extract tool arguments from an e-commerce customer message. The target tool and its "
        "schema are given. Output ONLY a JSON object with the fields you can confidently determine "
        "from the customer message; leave every other field OUT. Do not invent values, do not repeat "
        "the schema itself.\n"
        + struct_schema_hint(t.args_schema)
    )
    human = json.dumps({
        "tool": draft.tool_name,
        "already_collected": draft.args,
        "missing_so_far": draft.missing,
        "selected_product": selected,
        "customer_message": last_user_text(state.messages),
    }, ensure_ascii=False, default=str)
    extracted: dict[str, Any] = {}
    try:
        msg = model.invoke([SystemMessage(content=system), HumanMessage(content=human)])
        raw = parse_json_dict(content_text(msg)) or {}
        extracted = _coerce_args(raw, draft.tool_name)
    except Exception as e:
        logger.warning("extract_tool_args call failed (%s)", e)
    before_args_missing = _field_missing(draft.args, draft.tool_name)
    before_prereq_missing = _missing_prereqs(_prereqs_for(draft.tool_name, mem))
    draft.args.update(extracted)

    prereq_missing = _missing_prereqs(_prereqs_for(draft.tool_name, mem))
    if prereq_missing:
        addr_system = (
            "You extract a shipping address from an e-commerce customer message. Output ONLY a JSON "
            "object with the fields you can confidently determine; leave every other field OUT. Do "
            "not invent values, do not repeat the schema itself.\n"
            + struct_schema_hint(AddressFields)
        )
        addr_human = json.dumps({
            "customer_message": last_user_text(state.messages),
            "already_known": {f: getattr(mem.global_information, f, None) for f in ADDRESS_FIELD_DESCS},
        }, ensure_ascii=False, default=str)
        addr_raw: dict[str, Any] = {}
        try:
            msg = model.invoke([SystemMessage(content=addr_system), HumanMessage(content=addr_human)])
            addr_raw = parse_json_dict(content_text(msg)) or {}
        except Exception as e:
            logger.warning("address extraction call failed (%s)", e)
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
            flow.shipping = ShippingContext(
                wilaya=gi.wilaya,
                commune=gi.commune,
                address=gi.address,
                shipping_cost=flow.shipping.shipping_cost if flow.shipping else None,
            )
            logger.info("global address updated -> wilaya=%s commune=%s address=%s", gi.wilaya, gi.commune, gi.address)

    missing_args = _field_missing(draft.args, draft.tool_name)
    missing_prereqs = _missing_prereqs(_prereqs_for(draft.tool_name, mem))
    if (
        missing_args != before_args_missing
        or missing_prereqs != before_prereq_missing
        or extracted
    ):
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
    flow, draft = _flow_draft(state)
    if draft is None or flow is None:
        return {}
    required, props = _tool_schema_info(draft.tool_name)
    missing = draft.missing or _field_missing(draft.args, draft.tool_name)
    fields = [
        f"{name}: {props.get(name, {}).get('description') or name}"
        for name in missing
        if name in props
    ]
    known_gi = state.conversation_memory.global_information
    prereq_missing = _missing_prereqs(_prereqs_for(draft.tool_name, state.conversation_memory))
    fields.extend(f"{name}: {desc}" for name, desc in ADDRESS_FIELD_DESCS.items() if name in prereq_missing)
    selected = None
    if flow.product_discovery is not None and flow.product_discovery.selected_product is not None:
        selected = flow.product_discovery.selected_product.model_dump()
    system = (
        "You are a helpful e-commerce assistant completing a multi-step task. The customer must "
        "provide a few missing pieces of information. Ask ONLY for those missing items, phrased "
        "naturally and conversationally in the customer's language. Never ask about information we "
        "already know, and never restate the full task."
    )
    human = json.dumps({
        "task_tool": draft.tool_name,
        "missing_items": fields,
        "already_known": draft.args,
        "known_address": {f: getattr(known_gi, f, None) for f in ADDRESS_FIELD_DESCS},
        "selected_product": selected,
        "customer_message": last_user_text(state.messages),
    }, ensure_ascii=False, default=str)
    return {"needs_tool": False, "reply": llm_phrase(system, human)}


def after_extract(state: AgentState) -> str:
    _, draft = _flow_draft(state)
    if draft is not None and draft.status == "ready":
        return "calling_tool"
    return "ask_reply"
