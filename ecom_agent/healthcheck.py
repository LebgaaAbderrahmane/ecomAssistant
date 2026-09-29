"""Docker healthcheck: exits 0 only when AgentService.Health says SERVING."""

import sys

import grpc

from grpc_gen.agent.v1 import agent_pb2, agent_pb2_grpc

PROBE_ADDR = "127.0.0.1:50052"


def main() -> int:
    try:
        channel = grpc.insecure_channel(PROBE_ADDR)
        stub = agent_pb2_grpc.AgentServiceStub(channel)
        resp = stub.Health(agent_pb2.HealthRequest(), timeout=5)
        healthy = resp.status == agent_pb2.HealthResponse.STATUS_SERVING
    except Exception:
        healthy = False
    finally:
        channel.close()
    return 0 if healthy else 1


if __name__ == "__main__":
    sys.exit(main())