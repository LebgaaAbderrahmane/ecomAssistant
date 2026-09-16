import logging

from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode
from langgraph.runtime import CONFIG_KEY_RUNTIME, DEFAULT_RUNTIME

from config import model
from tools.registry import (
    searchProducts,
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
TOOL_NODE_CONFIG: dict = {"configurable": {CONFIG_KEY_RUNTIME: DEFAULT_RUNTIME}}
tool_model = model.bind_tools(TOOLS)

TOOL_NAMES = tuple(t.name for t in TOOLS)
TOOL_DESCRIPTIONS = {
    "searchProducts": "Search the catalog for products matching a free-text name or query (authoritative NOT_FOUND when absent).",
    "selectProduct": "Select the specific product the customer picked, by productId or productName.",
    "getProductDetails": "Return full details for a product by its id or name.",
    "suggestProducts": "Suggest products matching explicit criteria (category, color, size, min/maxPrice, preferences).",
    "calculateShipping": "Look up the delivery cost for a wilaya (name or number) for this merchant. Requires the wilaya the customer wants to send to.",
    "getOrderStatus": "Get the status and tracking number of an order by its id.",
    "createOrder": "Place an order: provide an explicit productId, quantity, delivery wilaya, and commune (both are required).",
    "confirmOrder": "Confirm an order by its id.",
    "modifyOrder": "Modify an existing order by its id (change wilaya, commune, or quantity).",
    "cancelOrder": "Cancel an order by its id.",
    "escalateConversation": "Escalate to a human agent with a reason — use only when no other tool can handle the request.",
}


def tool_for(tool_name: str, flow=None):
    return next((t for t in TOOLS if t.name == tool_name), None)