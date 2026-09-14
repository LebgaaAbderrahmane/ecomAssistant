from langchain_core.tools import tool

from tools.grpc import call_tool


def _args(**kwargs) -> dict:
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}


@tool
def searchProducts(query: str) -> str:
    """Search the product catalog by name, description or category."""
    return call_tool("searchProducts", {"product": query})


@tool
def chooseProduct(productName: str | None = None, productIndex: int | None = None) -> str:
    """Select one product from the current search results by name or index."""
    return call_tool("chooseProduct", _args(productName=productName, productIndex=productIndex))


@tool
def getProductDetails(productName: str | None = None) -> str:
    """Return the full details for a specific product by its name."""
    return call_tool("getProductDetails", _args(productName=productName))


@tool
def suggestProducts(
    category: str | None = None,
    color: str | None = None,
    size: str | None = None,
    minPrice: float | None = None,
    maxPrice: float | None = None,
    preferences: str | None = None,
) -> str:
    """Suggest products matching the customer's criteria."""
    return call_tool(
        "suggestProducts",
        _args(category=category, color=color, size=size, minPrice=minPrice, maxPrice=maxPrice, preferences=preferences),
    )


@tool
def calculateShipping(wilaya: str, commune: str | None = None) -> str:
    """Estimate the shipping cost for an order to a wilaya."""
    return call_tool("calculateShipping", _args(wilaya=wilaya, commune=commune))


@tool
def getOrderStatus(orderId: str) -> str:
    """Get the status of an existing order by its id."""
    return call_tool("getOrderStatus", {"orderId": orderId})


@tool
def createOrder(
    productId: str = "",
    product: str = "",
    wilaya: str = "",
    commune: str = "",
    quantity: int = 1,
) -> str:
    """Create an order for the given product. The shipping wilaya and commune are required; ask the customer for them if unknown."""
    return call_tool(
        "createOrder",
        _args(productId=productId, product=product, wilaya=wilaya, commune=commune, quantity=quantity),
    )


@tool
def confirmOrder(orderId: str | None = None, productName: str | None = None) -> str:
    """Confirm a pending order."""
    return call_tool("confirmOrder", _args(orderId=orderId, productName=productName))


@tool
def modifyOrder(
    orderId: str | None = None,
    wilaya: str | None = None,
    commune: str | None = None,
    quantity: int | None = None,
) -> str:
    """Modify an existing order's shipping address or quantity."""
    return call_tool("modifyOrder", _args(orderId=orderId, wilaya=wilaya, commune=commune, quantity=quantity))


@tool
def cancelOrder(orderId: str | None = None, productName: str | None = None) -> str:
    """Cancel an existing order."""
    return call_tool("cancelOrder", _args(orderId=orderId, productName=productName))


@tool
def escalateConversation() -> str:
    """Escalate the conversation to a human agent when nothing else can handle it."""
    return call_tool("escalateConversation", {})