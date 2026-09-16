from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class FlowState(str, Enum):
    PRODUCT_DISCOVERY = "PRODUCT_DISCOVERY"
    ORDER = "ORDER"
    SHIPPING = "SHIPPING"
    ORDER_TRACKING = "ORDER_TRACKING"
    RETURN = "RETURN"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class Filter(BaseModel):
    color: str | None = None
    size: str | None = None
    min_price: float | None = None
    max_price: float | None = None
    brand: str | None = None


class Variant(BaseModel):
    variant_id: str
    title: str
    available: bool = True


class Product(BaseModel):
    product_id: str
    product_name: str
    price: float
    variants: list[Variant] = Field(default_factory=list)


class ProductDiscoveryInput(BaseModel):
    product_name: str | None = None
    filters: Filter = Field(default_factory=Filter)


class ProductDiscoveryContext(BaseModel):
    input: ProductDiscoveryInput = Field(default_factory=ProductDiscoveryInput)
    tool_results: list[Product] = Field(default_factory=list)
    selected_product: Product | None = None
    retrieved_at: datetime | None = None


class OrderContext(BaseModel):
    order_id: str | None = None
    product_id: str | None = None
    variant_id: str | None = None
    quantity: int | None = None


class ShippingContext(BaseModel):
    wilaya: str | None = None
    commune: str | None = None
    address: str | None = None
    shipping_cost: float | None = None


class ToolCallDraft(BaseModel):
    tool_name: str
    args: dict[str, Any] = Field(default_factory=dict)
    prereqs: dict[str, Any] = Field(default_factory=dict)
    status: Literal["drafting", "ready", "executed", "cancelled"] = "drafting"
    attempts: int = 0
    missing: list[str] = Field(default_factory=list)


class Flow(BaseModel):
    flow_id: str
    state: FlowState
    created_at: datetime
    updated_at: datetime
    product_discovery: ProductDiscoveryContext | None = None
    order: OrderContext | None = None
    shipping: ShippingContext | None = None
    tool_draft: ToolCallDraft | None = None
