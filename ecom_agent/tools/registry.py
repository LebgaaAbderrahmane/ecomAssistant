from langchain_core.tools import tool


@tool
def searchProducts(query: str) -> str:
    """Search the product catalog by name, description or category."""
    return "searchProducts: not implemented"


@tool
def recallPreviousProducts() -> str:
    """Recall the products the customer recently viewed or searched."""
    return "recallPreviousProducts: not implemented"


@tool
def selectProduct(selector: str) -> str:
    """Select one product from the current results."""
    return "selectProduct: not implemented"


@tool
def getProductDetails(product_id: str) -> str:
    """Get the full details for a specific product by its id."""
    return "getProductDetails: not implemented"


@tool
def suggestProducts(category: str | None = None) -> str:
    """Suggest products for the customer."""
    return "suggestProducts: not implemented"


@tool
def calculateShipping(wilaya: str, commune: str) -> str:
    """Calculate shipping cost for an address."""
    return "calculateShipping: not implemented"


@tool
def getOrderStatus(order_id: str) -> str:
    """Get the status of an order."""
    return "getOrderStatus: not implemented"


@tool
def createOrder(product_id: str, quantity: int) -> str:
    """Create a new order for a product."""
    return "createOrder: not implemented"


@tool
def confirmOrder(order_id: str) -> str:
    """Confirm a pending order."""
    return "confirmOrder: not implemented"


@tool
def modifyOrder(order_id: str, quantity: int | None = None) -> str:
    """Modify an existing order."""
    return "modifyOrder: not implemented"


@tool
def cancelOrder(order_id: str) -> str:
    """Cancel an order."""
    return "cancelOrder: not implemented"


@tool
def escalateConversation(reason: str) -> str:
    """Escalate the conversation to a human agent."""
    return "escalateConversation: not implemented"
