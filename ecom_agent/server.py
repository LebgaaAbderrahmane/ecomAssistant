import logging
import os
from concurrent import futures

import grpc

from db import get_message
from grpc_gen.agent.v1 import agent_pb2, agent_pb2_grpc

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


class AgentService(agent_pb2_grpc.AgentServiceServicer):
    # Health is intentionally unauthenticated so orchestration tooling can
    # probe liveness without the internal key.
    def Health(self, request, context):
        return agent_pb2.HealthResponse(status=agent_pb2.HealthResponse.STATUS_SERVING)

    def ProcessMessage(self, request, context):
        if not _authorized(context.invocation_metadata()):
            context.set_code(grpc.StatusCode.UNAUTHENTICATED)
            context.set_details("missing or invalid INTERNAL_API_KEY")
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
        return agent_pb2.ProcessMessageResponse(
            decision=agent_pb2.ProcessMessageResponse.DECISION_REPLY,
            text="Bonjour, comment puis-je vous aider ?",
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