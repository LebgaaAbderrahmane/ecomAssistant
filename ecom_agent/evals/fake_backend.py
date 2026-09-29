"""A fake of back's GetConversationContext for evals.

It keeps one conversation's messages the way back does: back saves the
customer message before calling the agent, and saves the reply it sends.
"""
import nodes.memory
from evals import fake_tools
from models.backend import BackendContext, BackendCustomer, BackendMessage, BackendOrder

_messages: list[BackendMessage] = []
_customer = BackendCustomer()
_order: BackendOrder | None = None


def _order_from_fake_shop(order_id: str) -> BackendOrder:
    o = fake_tools.ORDERS[order_id]
    return BackendOrder(
        order_id=o["orderId"], status=o["status"], product_id=o["productId"], product_name=o["productName"],
        quantity=o["quantity"], total_amount=o["totalAmount"], delivery_cost=o["deliveryCost"],
        wilaya=o["wilaya"], commune=o["commune"], address=o["address"],
    )


def start(backend: dict) -> None:
    """Reset for a new test case. `backend` comes from the case: has_order, customer, messages."""
    global _customer, _order
    _messages.clear()
    for m in backend.get("messages", []):
        # A plain string is a message back sent (e.g. the order confirmation template).
        _messages.append(BackendMessage(sender="ai", text=m) if isinstance(m, str) else BackendMessage(**m))
    _customer = BackendCustomer(**backend.get("customer", {}))
    fake_tools.CURRENT_ORDER_ID = "o1" if backend.get("has_order") else None
    _order = _order_from_fake_shop("o1") if backend.get("has_order") else None


def add(sender: str, text: str) -> None:
    _messages.append(BackendMessage(sender=sender, text=text))


def fake_get_conversation_context(limit: int = 20) -> BackendContext:
    return BackendContext(customer=_customer, current_order=_order, messages=_messages[-limit:])


def install() -> None:
    nodes.memory.get_conversation_context = fake_get_conversation_context
