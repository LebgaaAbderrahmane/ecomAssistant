import logging
import os
from concurrent import futures

import grpc
from langchain_core.messages import HumanMessage

from db import get_message
from graph import app
from prompts.common import GREETING
from grpc_gen.agent.v1 import agent_pb2, agent_pb2_grpc
from tools.grpc import tool_identity

logging.basicConfig(
    level=logging.INFO,
    format="[ecom_agent] %(levelname)s %(message)s",
)
log = logging.getLogger("ecom_agent.server")

AGENT_GRPC_ADDR = os.environ.get("AGENT_GRPC_ADDR", "0.0.0.0:50052")
INTERNAL_API_KEY = os.environ.get("INTERNAL_API_KEY", "dev-internal-key")


def _authorized(metadata) -> bool:
    expected = f"Bearer {INTERNAL_API_KEY}"
    for key, value in metadata or []:
        if key.lower() == "authorization" and value == expected:
            return True
    return False


def _last_reply(state) -> str:
    """Latest assistant text produced by this turn's graph run.

    The reply node always appends an AIMessage, so a non-empty trailing AI
    message is the turn's answer. Turns that end via the escalate node add no
    AI message, so they surface as an empty string here. The search stops at
    the latest customer message: the checkpointer keeps every turn, and an
    older turn's reply must never be sent again.
    """
    messages = getattr(state, "messages", None)
    if messages is None and isinstance(state, dict):
        messages = state.get("messages", [])
    for m in reversed(messages or []):
        if getattr(m, "type", "") == "human":
            break
        if getattr(m, "type", "") != "ai":
            continue
        if hasattr(m, "content"):
            content = m.content
        elif isinstance(m, dict):
            content = m.get("content", "")
        else:
            content = ""
        if isinstance(content, list):
            parts = [p.get("text", "") for p in content if isinstance(p, dict)]
            return " ".join(p for p in parts if p) or str(content)
        return str(content)
    return ""


class AgentService(agent_pb2_grpc.AgentServiceServicer):
    # No auth on Health, so the Docker healthcheck works without the key.
    def Health(self, request, context):
        return agent_pb2.HealthResponse(status=agent_pb2.HealthResponse.STATUS_SERVING)

    def ProcessMessage(self, request, context):
        if not _authorized(context.invocation_metadata()):
            context.set_code(grpc.StatusCode.UNAUTHENTICATED)
            context.set_details("missing or invalid INTERNAL_API_KEY")
            return agent_pb2.ProcessMessageResponse()
        if not request.message_id:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            context.set_details("message_id is empty")
            return agent_pb2.ProcessMessageResponse()
        log.info(
            "ProcessMessage message=%s conversation=%s merchant=%s customer=%s",
            request.message_id,
            request.conversation_id,
            request.merchant_id,
            request.customer_id,
        )
        message = get_message(request.message_id)
        if message is not None:
            log.info(
                "loaded message role=%s text=%r (conversation=%s)",
                message["role"],
                message["text"],
                message["conversationId"],
            )
        else:
            log.warning("message %s not found in Postgres", request.message_id)

        role = message["role"] if message else "unknown"
        text = (message["text"] or "").strip() if message else ""
        agent_context = {
            "message_id": request.message_id,
            "conversation_id": request.conversation_id,
            "merchant_id": request.merchant_id,
            "customer_id": request.customer_id,
            "role": role,
            "text": text,
        }
        log.info("agent context: %s", agent_context)

        if role != "customer" or not text:
            return agent_pb2.ProcessMessageResponse(
                decision=agent_pb2.ProcessMessageResponse.DECISION_REPLY,
                text=GREETING,
            )

        config = {
            "configurable": {
                "thread_id": request.conversation_id,
                "store_key": request.conversation_id,
            }
        }
        try:
            with tool_identity(
                conversation_id=request.conversation_id,
                merchant_id=request.merchant_id,
                customer_id=request.customer_id,
            ):
                state = app.invoke(
                    {"messages": [HumanMessage(content=text)]},
                    config=config,
                )
        except Exception as exc:
            log.error(
                "agent graph failed for message=%s: %s",
                request.message_id,
                exc,
                exc_info=True,
            )
            return agent_pb2.ProcessMessageResponse(
                decision=agent_pb2.ProcessMessageResponse.DECISION_ESCALATE,
            )

        reply_text = _last_reply(state)
        log.info(
            "graph result for message=%s reply=%r -> %s",
            request.message_id,
            reply_text[:200] if reply_text else None,
            "reply" if reply_text.strip() else "escalate",
        )
        if reply_text.strip():
            return agent_pb2.ProcessMessageResponse(
                decision=agent_pb2.ProcessMessageResponse.DECISION_REPLY,
                text=reply_text,
            )
        return agent_pb2.ProcessMessageResponse(
            decision=agent_pb2.ProcessMessageResponse.DECISION_ESCALATE,
        )


def serve(addr: str = AGENT_GRPC_ADDR) -> None:
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    agent_pb2_grpc.add_AgentServiceServicer_to_server(AgentService(), server)
    if server.add_insecure_port(addr) == 0:
        raise RuntimeError(f"could not bind gRPC addr {addr}")
    log.info("AgentService listening on %s", addr)
    server.start()
    server.wait_for_termination()


if __name__ == "__main__":
    serve()