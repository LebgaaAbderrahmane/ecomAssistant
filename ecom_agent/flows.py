from typing import Any

from models.conversation import ConversationMemory
from models.domain import Flow


def active_flow(mem: ConversationMemory, resolved_flow_id: str | None) -> Flow | None:
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def selected_product(flow: Flow) -> dict[str, Any] | None:
    if flow.product_discovery is not None and flow.product_discovery.selected_product is not None:
        return flow.product_discovery.selected_product.model_dump()
    return None

