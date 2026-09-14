from langchain_core.tools import tool

from tools.grpc import call_tool


def _args(**kwargs) -> dict:
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}


@tool
def searchProducts(product: str) -> str:
    """Search the merchant catalog for a product by name and return the matching products. The result is authoritative: no match means the product is not in the catalog."""
    return call_tool("searchProducts", {"product": product})


@tool
def selectProduct(productId: str | None = None, productName: str | None = None) -> str:
    """Select a product the customer picked (by its id or by its name) and make it the active product."""
    return call_tool("selectProduct", _args(productId=productId, productName=productName))


@tool
def getProductDetails(productId: str | None = None, productName: str | None = None) -> str:
    """Return the full details (description, price, currency, stock status, category) for a product by its id or its name."""
    return call_tool("getProductDetails", _args(productId=productId, productName=productName))


@tool
def suggestProducts(
    category: str | None = None,
    color: str | None = None,
    size: str | None = None,
    minPrice: float | None = None,
    maxPrice: float | None = None,
    preferences: str | None = None,
) -> str:
    """Suggest products matching the customer's explicit criteria (category, color, size, price range, or free-text preferences)."""
    return call_tool(
        "suggestProducts",
        _args(category=category, color=color, size=size, minPrice=minPrice, maxPrice=maxPrice, preferences=preferences),
    )


@tool
def calculateShipping(wilaya: str) -> str:
    """Look up the delivery cost configured for a wilaya (name or number) for this merchant. Requires the wilaya the customer wants to send to."""
    return call_tool("calculateShipping", {"wilaya": wilaya})


@tool
def getOrderStatus(orderId: str) -> str:
    """Get the status and tracking number of an existing order by its id. Required: the order id — reference the customer's order or use the active one."""
    return call_tool("getOrderStatus", {"orderId": orderId})


@tool
def createOrder(productId: str, quantity: int, wilaya: str, commune: str) -> str:
    """Create a new order for the given product id with the delivery wilaya and commune (both are required — ask the customer for them if unknown)."""
    return call_tool(
        "createOrder",
        _args(productId=productId, quantity=quantity, wilaya=wilaya, commune=commune),
    )


@tool
def confirmOrder(orderId: str) -> str:
    """Confirm an existing order by its id."""
    return call_tool("confirmOrder", {"orderId": orderId})


@tool
def modifyOrder(
    orderId: str,
    wilaya: str | None = None,
    commune: str | None = None,
    quantity: int | None = None,
) -> str:
    """Modify an order (by its id) — change its shipping wilaya, commune, or quantity."""
    return call_tool("modifyOrder", _args(orderId=orderId, wilaya=wilaya, commune=commune, quantity=quantity))


@tool
def cancelOrder(orderId: str) -> str:
    """Cancel an existing order by its id."""
    return call_tool("cancelOrder", {"orderId": orderId})


@tool
def escalateConversation(reason: str) -> str:
    """Escalate the conversation to a human agent with a reason when nothing else can handle it."""
    return call_tool("escalateConversation", {"reason": reason})