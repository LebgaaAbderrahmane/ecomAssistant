from typing import Any

from models.conversation import ConversationMemory, GlobalInformation
from models.domain import Flow, ShippingContext, ToolCallDraft
from models.state import AgentState

ADDRESS_FIELD_DESCS = {
    "wilaya": "the wilaya (province) to ship to",
    "commune": "the commune (city/town) to ship to",
    "address": "the street or detailed delivery address",
}


def active_flow(mem: ConversationMemory, resolved_flow_id: str | None) -> Flow | None:
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def flow_draft(state: AgentState) -> tuple[Flow | None, ToolCallDraft | None]:
    flow = active_flow(state.conversation_memory, state.resolved_flow_id)
    return flow, (flow.tool_draft if flow else None)


def selected_product(flow: Flow) -> dict[str, Any] | None:
    if flow.product_discovery is not None and flow.product_discovery.selected_product is not None:
        return flow.product_discovery.selected_product.model_dump()
    return None


def sync_shipping(flow: Flow, gi: GlobalInformation) -> None:
    """Copy the saved address into the flow, keeping the known shipping cost."""
    flow.shipping = ShippingContext(
        wilaya=gi.wilaya,
        commune=gi.commune,
        address=gi.address,
        shipping_cost=flow.shipping.shipping_cost if flow.shipping else None,
    )


def prereqs_for(tool_name: str, mem: ConversationMemory) -> dict[str, Any]:
    if tool_name != "createOrder":
        return {}
    gi = mem.global_information
    prereqs: dict[str, Any] = {}
    for f in ADDRESS_FIELD_DESCS:
        if not getattr(gi, f, None):
            prereqs[f] = None
    return prereqs


def unfilled_prereqs(prereqs: dict[str, Any]) -> list[str]:
    return [k for k, v in prereqs.items() if v is None or v == ""]
