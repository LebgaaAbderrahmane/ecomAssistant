"""Backend ToolService gRPC client for the agent.

Every call to the backend's ToolService must carry the internal auth metadata.
Regardless of the RPC, the client always attaches

    authorization: Bearer <INTERNAL_API_KEY>

so the backend can authenticate the agent (mirrors ecom_agent/server.py's own
verification for the reverse direction).

The backend resolves tool entities itself: it merges the supplied identity
(merchant/customer/conversation) with backend-owned context (current order /
product, saved address, memory) before dispatching to the registry, so a tool
call carries the exact same input it would over the internal pipeline.
"""

import json
import logging
import os

import grpc

from grpc_gen.tools.v1 import tool_pb2, tool_pb2_grpc

logger = logging.getLogger("ecom_agent.tool_client")

# Address of the BACKEND's ToolService grpc server, as seen from the agent
# container. Deliberately NOT TOOLS_GRPC_ADDR: that variable is the back's
# server bind address (0.0.0.0:50051) and must not be reused as a client target.
BACK_TOOLS_GRPC_ADDR = os.environ.get("BACK_TOOLS_GRPC_ADDR", "back:50051")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


class ToolServiceError(Exception):
    """Raised when the backend rejects a call with a non-OK gRPC status.

    Mirrors grpc.RpcError's surface (code() / details()) so callers can handle
    backend hard failures uniformly with transport errors.
    """

    def __init__(self, code: grpc.StatusCode, details: str):
        super().__init__(f"{code.name}: {details}")
        self._code = code
        self._details = details

    def code(self) -> grpc.StatusCode:
        return self._code

    def details(self) -> str:
        return self._details


class ToolServiceClient:
    def __init__(self, address: str | None = None, api_key: str | None = None):
        self._address = address or BACK_TOOLS_GRPC_ADDR
        self._token = api_key or INTERNAL_API_KEY
        self._channel = grpc.insecure_channel(self._address)
        self._stub = tool_pb2_grpc.ToolServiceStub(self._channel)

    def close(self) -> None:
        self._channel.close()

    def _auth_metadata(self) -> tuple[tuple[str, str], ...]:
        # Attached to every call, including Health, so a single code path
        # guarantees the backend can authenticate each ExecuteTool request.
        return (("authorization", f"Bearer {self._token}"),)

    def health(self) -> str:
        response = self._stub.Health(
            tool_pb2.HealthRequest(),
            metadata=self._auth_metadata(),
        )
        return tool_pb2.HealthResponse.Status.Name(response.status)

    def execute_tool(
        self,
        tool_name: str,
        entities: dict | None,
        *,
        merchant_id: str,
        customer_id: str,
        conversation_id: str,
    ) -> dict:
        """Call ExecuteTool with the auth metadata on the request.

        Returns a dict of the wire response:

            {"success": bool,
             "outcome": int,   # tool_pb2.ExecuteToolResponse.OUTCOME_*
             "data": dict,     # parsed data_json ({} when empty or unparseable)
             "error": str}

        Recoverable outcomes (success=false with NOT_FOUND/AMBIGUOUS/... ) come
        back as an OK response and are surfaced in the dict. Hard failures
        (invalid tool, bad input, missing rows, auth) raise ToolServiceError.
        """
        if entities is not None and not isinstance(entities, dict):
            raise TypeError("entities must be a dict or None")

        request = tool_pb2.ExecuteToolRequest(
            tool_name=tool_name,
            entities_json=json.dumps(entities or {}, ensure_ascii=False),
            identity=tool_pb2.Identity(
                merchant_id=merchant_id,
                customer_id=customer_id,
                conversation_id=conversation_id,
            ),
        )
        try:
            response = self._stub.ExecuteTool(request, metadata=self._auth_metadata())
        except grpc.RpcError as exc:
            raise ToolServiceError(exc.code(), exc.details() or "") from exc

        data: dict = {}
        if response.data_json:
            try:
                data = json.loads(response.data_json)
            except json.JSONDecodeError:
                logger.warning(
                    "tool %s returned unparseable data_json %r", tool_name, response.data_json
                )
            if not isinstance(data, dict):
                data = {}

        return {
            "success": bool(response.success),
            "outcome": int(response.outcome),
            "data": data,
            "error": response.error or "",
        }


_client: ToolServiceClient | None = None


def get_tool_client() -> ToolServiceClient:
    """Lazily create a shared client (reuse the channel across calls)."""
    global _client
    if _client is None:
        _client = ToolServiceClient()
    return _client