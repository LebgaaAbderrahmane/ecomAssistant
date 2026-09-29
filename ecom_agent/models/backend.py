from typing import Any, Literal

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from pydantic import BaseModel, Field


class BackendCustomer(BaseModel):
    name: str = ""
    language: str = ""
    wilaya: str = ""
    commune: str = ""


class BackendOrder(BaseModel):
    order_id: str
    status: str = ""
    product_id: str = ""
    product_name: str = ""
    quantity: int = 0
    total_amount: float = 0
    delivery_cost: float = 0
    wilaya: str = ""
    commune: str = ""
    address: str = ""
    tracking_number: str = ""


class BackendProduct(BaseModel):
    product_id: str
    name: str = ""
    price: float = 0
    currency: str = ""
    stock_status: str = ""


class BackendMessage(BaseModel):
    sender: Literal["customer", "ai", "merchant"]
    text: str


class BackendContext(BaseModel):
    """What back knows about the conversation, loaded fresh at the start of each message."""

    customer: BackendCustomer = Field(default_factory=BackendCustomer)
    current_order: BackendOrder | None = None
    current_product: BackendProduct | None = None
    messages: list[BackendMessage] = Field(default_factory=list)

    def chat_history(self) -> list[BaseMessage]:
        history: list[BaseMessage] = []
        for m in self.messages:
            if m.sender == "customer":
                history.append(HumanMessage(content=m.text))
            elif m.sender == "merchant":
                # A human from the shop wrote it, not the agent.
                history.append(AIMessage(content=f"[merchant] {m.text}"))
            else:
                history.append(AIMessage(content=m.text))
        return history

    def summary(self) -> dict[str, Any]:
        customer = {k: v for k, v in self.customer.model_dump().items() if v}
        return {
            "customer": customer or None,
            "current_order": self.current_order.model_dump(exclude_defaults=True) if self.current_order else None,
            "current_product": self.current_product.model_dump(exclude_defaults=True) if self.current_product else None,
        }
