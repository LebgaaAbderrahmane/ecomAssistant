from langchain_core.tools import tool
from pydantic import BaseModel, Field

from tools.grpc import call_tool


class SearchProductsArgs(BaseModel):
    product: str = Field(description="The product name or free-text query to search in the merchant catalog.")


@tool(args_schema=SearchProductsArgs)
def searchProducts(product: str) -> str:
    """Search the merchant catalog for a product by name and return the matching products. The result is authoritative: no match means the product is not in the catalog."""
    return call_tool("searchProducts", {"product": product})


class SelectProductArgs(BaseModel):
    productId: str | None = Field(default=None, description="The product id the customer picked.")
    productName: str | None = Field(default=None, description="The name of the product the customer picked.")


@tool(args_schema=SelectProductArgs)
def selectProduct(productId: str | None = None, productName: str | None = None) -> str:
    """Select a product the customer picked (by its id or by its name) and make it the active product."""
    return call_tool("selectProduct", _only(productId=productId, productName=productName))


class GetProductDetailsArgs(BaseModel):
    productId: str | None = Field(default=None, description="The product id to fetch details for.")
    productName: str | None = Field(default=None, description="The name of the product to fetch details for.")


@tool(args_schema=GetProductDetailsArgs)
def getProductDetails(productId: str | None = None, productName: str | None = None) -> str:
    """Return the full details (description, price, currency, stock status, category) for a product by its id or its name."""
    return call_tool("getProductDetails", _only(productId=productId, productName=productName))


class SuggestProductsArgs(BaseModel):
    category: str | None = Field(default=None, description="The product category the customer asked for.")
    color: str | None = Field(default=None, description="The color the customer asked for.")
    size: str | None = Field(default=None, description="The size the customer asked for.")
    minPrice: float | None = Field(default=None, description="Minimum price filter.")
    maxPrice: float | None = Field(default=None, description="Maximum price filter.")
    preferences: str | None = Field(default=None, description="Free-text preferences for the suggestion.")


@tool(args_schema=SuggestProductsArgs)
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
        _only(category=category, color=color, size=size, minPrice=minPrice, maxPrice=maxPrice, preferences=preferences),
    )


class CalculateShippingArgs(BaseModel):
    wilaya: str = Field(description="The wilaya (name or code number) to calculate delivery for.")


@tool(args_schema=CalculateShippingArgs)
def calculateShipping(wilaya: str) -> str:
    """Look up the delivery cost configured for a wilaya (name or number) for this merchant. Requires the wilaya the customer wants to send to."""
    return call_tool("calculateShipping", {"wilaya": wilaya})


class GetOrderStatusArgs(BaseModel):
    orderId: str | None = Field(default=None, description="The id of the order to get the status and tracking number for. Leave empty to use the customer's current order.")


@tool(args_schema=GetOrderStatusArgs)
def getOrderStatus(orderId: str | None = None) -> str:
    """Get the status and tracking number of the customer's order (the current one unless an id is given)."""
    return call_tool("getOrderStatus", _only(orderId=orderId))


class CreateOrderArgs(BaseModel):
    productId: str = Field(description="The product id to order — use the product the customer selected.")
    quantity: int = Field(description="How many units to order (integer).")
    wilaya: str = Field(description="The wilaya (province) the order ships to.")
    commune: str = Field(description="The commune (city/town) the order ships to.")
    address: str | None = Field(default=None, description="The street, building or neighborhood for home delivery. Never a quantity, a yes/no, or the wilaya/commune.")


@tool(args_schema=CreateOrderArgs)
def createOrder(productId: str, quantity: int, wilaya: str, commune: str, address: str | None = None) -> str:
    """Create a new order for the given product id with the delivery wilaya and commune (both are required — ask the customer for them if unknown)."""
    return call_tool("createOrder", _only(productId=productId, quantity=quantity, wilaya=wilaya, commune=commune, address=address))


class ConfirmOrderArgs(BaseModel):
    orderId: str | None = Field(default=None, description="The id of the order to confirm. Leave empty to use the customer's current order.")


@tool(args_schema=ConfirmOrderArgs)
def confirmOrder(orderId: str | None = None) -> str:
    """Confirm the customer's order (the current one unless an id is given)."""
    return call_tool("confirmOrder", _only(orderId=orderId))


class ModifyOrderArgs(BaseModel):
    orderId: str | None = Field(default=None, description="The id of the order to modify. Leave empty to use the customer's current order.")
    wilaya: str | None = Field(default=None, description="The new shipping wilaya (province).")
    commune: str | None = Field(default=None, description="The new shipping commune (city/town).")
    quantity: int | None = Field(default=None, description="The new order quantity (integer).")


@tool(args_schema=ModifyOrderArgs)
def modifyOrder(
    orderId: str | None = None,
    wilaya: str | None = None,
    commune: str | None = None,
    quantity: int | None = None,
) -> str:
    """Modify the customer's order (the current one unless an id is given) — change its shipping wilaya, commune, or quantity."""
    return call_tool("modifyOrder", _only(orderId=orderId, wilaya=wilaya, commune=commune, quantity=quantity))


class CancelOrderArgs(BaseModel):
    orderId: str | None = Field(default=None, description="The id of the order to cancel. Leave empty to use the customer's current order.")


@tool(args_schema=CancelOrderArgs)
def cancelOrder(orderId: str | None = None) -> str:
    """Cancel the customer's order (the current one unless an id is given)."""
    return call_tool("cancelOrder", _only(orderId=orderId))


class EscalateConversationArgs(BaseModel):
    reason: str = Field(description="Human-readable reason why the conversation is escalated to a human agent.")


@tool(args_schema=EscalateConversationArgs)
def escalateConversation(reason: str) -> str:
    """Escalate the conversation to a human agent with a reason when nothing else can handle it."""
    return call_tool("escalateConversation", {"reason": reason})


def _only(**kwargs) -> dict:
    return {k: v for k, v in kwargs.items() if v is not None and v != ""}
