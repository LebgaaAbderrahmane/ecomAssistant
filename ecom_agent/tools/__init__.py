import logging

from langchain_core.tools import tool
from langgraph.prebuilt import ToolNode

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
tool_model = model.bind_tools(TOOLS)

TOOL_NAMES = tuple(t.name for t in TOOLS)
TOOL_DESCRIPTIONS = {
    "searchProducts": "Search the catalog for products matching a free-text name or query (authoritative NOT_FOUND when absent).",
    "selectProduct": "Select the specific product the customer picked, by productId or productName.",
    "getProductDetails": "Return full details for a product by its id or name.",
    "suggestProducts": "Suggest products matching explicit criteria (category, color, size, min/maxPrice, preferences).",
    "calculateShipping": "Estimate shipping cost for an order to a location.",
    "getOrderStatus": "Check the status of an existing order.",
    "createOrder": "Place an order for the product already selected in the active flow (provide quantity, and the shipping wilaya and commune).",
    "confirmOrder": "Confirm a pending order.",
    "modifyOrder": "Modify an existing order.",
    "cancelOrder": "Cancel an existing order.",
    "escalateConversation": "Only when the request truly cannot be handled by the other tools.",
}


def tool_for(tool_name: str, flow=None):
    return next((t for t in TOOLS if t.name == tool_name), None)