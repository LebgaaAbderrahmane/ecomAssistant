import json
import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar

import grpc

from grpc_gen.tools.v1 import tool_pb2, tool_pb2_grpc
from models.backend import BackendContext, BackendCustomer, BackendMessage, BackendOrder, BackendProduct

logger = logging.getLogger(__name__)

# Not TOOLS_GRPC_ADDR: that one is back's own bind address.
BACK_TOOLS_GRPC_ADDR = os.environ.get("BACK_TOOLS_GRPC_ADDR", "back:50051")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")

_identity_var: ContextVar[dict | None] = ContextVar("tool_identity", default=None)
_client: tuple[grpc.Channel, tool_pb2_grpc.ToolServiceStub] | None = None


def _get_stub() -> tool_pb2_grpc.ToolServiceStub:
    global _client
    if _client is None:
        channel = grpc.insecure_channel(BACK_TOOLS_GRPC_ADDR)
        _client = (channel, tool_pb2_grpc.ToolServiceStub(channel))
    return _client[1]


def _auth_metadata() -> tuple[tuple[str, str], ...]:
    return (("authorization", f"Bearer {INTERNAL_API_KEY}"),)


@contextmanager
def tool_identity(*, conversation_id: str, merchant_id: str | None = None, customer_id: str | None = None):
    """Tool calls made inside this block run for this conversation."""
    token = _identity_var.set(
        {
            "conversation_id": conversation_id,
            "merchant_id": merchant_id or "",
            "customer_id": customer_id or "",
        }
    )
    try:
        yield
    finally:
        _identity_var.reset(token)


def get_identity() -> dict | None:
    return _identity_var.get()


def call_tool(tool_name: str, entities: dict) -> str:
    """Returns back's data as a JSON string.

    Soft failures (e.g. NOT_FOUND) come back as JSON with outcome and error.
    Hard gRPC failures raise ToolCallError.
    """
    identity = _identity_var.get()
    if identity is None or not identity.get("conversation_id"):
        raise RuntimeError(
            "tool identity not set: run inside tool_identity(conversation_id=...)"
        )
    try:
        response = _get_stub().ExecuteTool(
            tool_pb2.ExecuteToolRequest(
                tool_name=tool_name,
                entities_json=json.dumps(entities, ensure_ascii=False),
                identity=tool_pb2.Identity(
                    conversation_id=identity["conversation_id"],
                    merchant_id=identity.get("merchant_id") or "",
                    customer_id=identity.get("customer_id") or "",
                ),
            ),
            metadata=_auth_metadata(),
        )
    except grpc.RpcError as exc:
        status = exc.code()
        details = exc.details() or ""
        raise ToolCallError(f"{(status.name if status else 'UNKNOWN')}: {details}") from exc

    if not response.success:
        payload: dict = {"outcome": response.outcome, "error": response.error or ""}
        if response.data_json:
            try:
                payload.update(json.loads(response.data_json))
            except json.JSONDecodeError:
                payload["data_json"] = response.data_json
        return json.dumps(payload, ensure_ascii=False)
    return response.data_json or "{}"


_SENDERS = {
    tool_pb2.ContextMessage.SENDER_CUSTOMER: "customer",
    tool_pb2.ContextMessage.SENDER_AI: "ai",
    tool_pb2.ContextMessage.SENDER_MERCHANT: "merchant",
}


def get_conversation_context(limit: int = 20) -> BackendContext | None:
    """What back knows about this conversation, or None when back cannot answer.

    None is not an error for the caller: the agent then works like before, with
    only what it did itself in this chat.
    """
    identity = _identity_var.get()
    if identity is None or not identity.get("conversation_id"):
        return None
    try:
        r = _get_stub().GetConversationContext(
            tool_pb2.GetConversationContextRequest(
                identity=tool_pb2.Identity(
                    conversation_id=identity["conversation_id"],
                    merchant_id=identity.get("merchant_id") or "",
                    customer_id=identity.get("customer_id") or "",
                ),
                message_limit=limit,
            ),
            metadata=_auth_metadata(),
            timeout=5,
        )
    except grpc.RpcError as exc:
        logger.warning("GetConversationContext failed (%s); continuing without backend context", exc.code())
        return None
    o, p = r.current_order, r.current_product
    return BackendContext(
        customer=BackendCustomer(
            name=r.customer.name, language=r.customer.language, wilaya=r.customer.wilaya, commune=r.customer.commune,
        ),
        current_order=BackendOrder(
            order_id=o.order_id, status=o.status, product_id=o.product_id, product_name=o.product_name,
            quantity=o.quantity, total_amount=o.total_amount, delivery_cost=o.delivery_cost, wilaya=o.wilaya,
            commune=o.commune, address=o.address, tracking_number=o.tracking_number,
        ) if r.HasField("current_order") else None,
        current_product=BackendProduct(
            product_id=p.product_id, name=p.name, price=p.price, currency=p.currency, stock_status=p.stock_status,
        ) if r.HasField("current_product") else None,
        messages=[
            BackendMessage(sender=_SENDERS[m.sender], text=m.text)
            for m in r.messages
            if m.sender in _SENDERS and m.text.strip()
        ],
    )


class ToolCallError(Exception):
    """A hard gRPC failure (invalid tool, bad input, auth, missing row, ...)."""