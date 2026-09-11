import json
import logging
from typing import Any

from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode

from ecoma_agent.config import model
from ecoma_agent.tools.registry import (
    searchProducts,
    recallPreviousProducts,
    selectProduct,
    getProductDetails,
    suggestProducts,
    calculateShipping,
    getOrderStatus,
    createOrder,
    confirmOrder,
    modifyOrder,
    cancelOrder,
    escalateConversation,
)

logger = logging.getLogger(__name__)

TOOLS = [
    searchProducts,
    recallPreviousProducts,
    selectProduct,
    getProductDetails,
    suggestProducts,
    calculateShipping,
    getOrderStatus,
    createOrder,
    confirmOrder,
    modifyOrder,
    cancelOrder,
    escalateConversation,
]

tool_node = ToolNode(TOOLS)
tool_model = model.bind_tools(TOOLS)

TOOL_NAMES = tuple(t.name for t in TOOLS)
TOOL_DESCRIPTIONS = {
    "searchProducts": "Search the catalog for products matching a free-text query.",
    "recallPreviousProducts": "Bring back products shown in an earlier product search.",
    "selectProduct": "Select a specific product from the current search results.",
    "getProductDetails": "Return full details for a product by its id.",
    "suggestProducts": "Suggest products matching some criteria.",
    "calculateShipping": "Estimate shipping cost for an order to a location.",
    "getOrderStatus": "Check the status of an existing order.",
    "createOrder": "Place an order for the product already selected in the active flow (set quantity).",
    "confirmOrder": "Confirm a pending order.",
    "modifyOrder": "Modify an existing order.",
    "cancelOrder": "Cancel an existing order.",
    "escalateConversation": "Only when the request truly cannot be handled by the other tools.",
}


def tool_for(tool_name: str, flow=None):
    if tool_name == "createOrder":
        return make_create_order_tool(flow)
    return next((t for t in TOOLS if t.name == tool_name), None)


def make_create_order_tool(flow):
    from ecoma_agent.models.domain import Flow

    @tool
    def createOrder(quantity: int) -> str:
        """Create an order for the product selected in the current flow."""
        product = None
        if flow is not None and flow.product_discovery is not None:
            if flow.product_discovery.selected_product is not None:
                product = flow.product_discovery.selected_product
            elif flow.product_discovery.tool_results:
                product = flow.product_discovery.tool_results[0]
        if product is None:
            return (
                f"No product selected in flow {flow.flow_id if flow else 'none'} to order. "
                "Run a product search first so the product is attached to the active flow."
            )
        shipping = flow.shipping if flow is not None else None
        payload: dict[str, Any] = {
            "tool": "createOrder",
            "product_id": product.product_id,
            "product_name": product.product_name,
            "price": product.price,
            "currency": "DZD",
            "quantity": quantity,
            "status": "order_created",
        }
        if shipping and (shipping.wilaya or shipping.commune or shipping.address):
            payload["shipping"] = shipping.model_dump()
        else:
            payload["shipping"] = None
            payload["status"] = "order_pending_address"
            payload["message"] = "Please provide your shipping address (wilaya and commune) so we can finalize the order."
        return json.dumps(payload, ensure_ascii=False)
    return createOrder
