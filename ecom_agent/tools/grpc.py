import json
import logging
import os
from contextlib import contextmanager
from contextvars import ContextVar

import grpc

from grpc_gen.tools.v1 import tool_pb2, tool_pb2_grpc

logger = logging.getLogger(__name__)

# Deliberately separate from the back's TOOLS_GRPC_ADDR (the server bind
# address) so the agent connects to the back service, not to its own network.
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
    """Bind the active conversation identity for the current request scope.

    Tools delegate to the backend via ExecuteTool, which re-materializes
    merchant/customer from the conversation row; the agent only needs to scope
    the call. Wrap every request handled for a conversation in this context.
    """
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
    """Execute a backend tool for the current (context-bound) conversation.

    Returns the backend's data as a JSON string (so product results match what
    calling_tool's _tool_result_products parses). Recoverable outcomes (e.g.
    OUTCOME_NOT_FOUND) come back as an OK response and are surfaced as a JSON
    string carrying outcome + error + data. Hard failures raise ToolCallError.
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


class ToolCallError(Exception):
    """A hard gRPC failure (invalid tool, bad input, auth, missing row, ...)."""