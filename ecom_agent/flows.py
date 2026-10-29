from typing import Any

from models.conversation import ConversationMemory
from models.domain import Flow, Product, ProductDiscoveryContext

MAX_SHOWN_PRODUCTS = 10


def active_flow(mem: ConversationMemory, resolved_flow_id: str | None) -> Flow | None:
    flow_id = resolved_flow_id or mem.active_flow_id
    if not flow_id:
        return None
    return next((f for f in mem.flows if f.flow_id == flow_id), None)


def selected_product(flow: Flow) -> dict[str, Any] | None:
    if flow.product_discovery is not None and flow.product_discovery.selected_product is not None:
        return flow.product_discovery.selected_product.model_dump()
    return None


def clear_selected_product(mem: ConversationMemory) -> None:
    """Only one product is selected at a time in a conversation, so it is cleared in every flow."""
    for f in mem.flows:
        if f.product_discovery is not None:
            f.product_discovery.selected_product = None


def _discovery(flow: Flow) -> ProductDiscoveryContext:
    if flow.product_discovery is None:
        flow.product_discovery = ProductDiscoveryContext()
    return flow.product_discovery


def select_product(mem: ConversationMemory, flow: Flow, product: Product) -> None:
    clear_selected_product(mem)
    _discovery(flow).selected_product = product


def show_products(mem: ConversationMemory, flow: Flow, products: list[Product]) -> None:
    """The list replaces the shown products. A list of several products is not a choice."""
    _discovery(flow).tool_results = products
    clear_selected_product(mem)
    if len(products) == 1:
        _discovery(flow).selected_product = products[0]


def current_selected_product(mem: ConversationMemory) -> dict[str, Any] | None:
    """The flow LLM can open a new flow for the order, so the selected product may sit in another flow."""
    picked = [f for f in mem.flows if selected_product(f)]
    return selected_product(max(picked, key=lambda f: f.updated_at)) if picked else None


def shown_products(mem: ConversationMemory) -> list[dict[str, str]]:
    """The products of the latest lists, so the LLM can turn "the Casio" into its id."""
    shown: dict[str, str] = {}
    for f in sorted(mem.flows, key=lambda f: f.updated_at):
        if f.product_discovery is not None:
            for p in f.product_discovery.tool_results:
                shown.pop(p.product_id, None)  # a product shown again moves to the end
                shown[p.product_id] = p.product_name
    latest = list(shown.items())[-MAX_SHOWN_PRODUCTS:]
    return [{"product_id": pid, "product_name": name} for pid, name in latest]
