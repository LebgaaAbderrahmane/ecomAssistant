#!/usr/bin/env bash
set -euo pipefail

# Regenerates the Python gRPC stubs from contracts/proto (the source of truth)
# using grpcio-tools. The stubs are committed to grpc_gen/ so the container
# does not need protoc at build time.
#
# Run after changing any .proto file, then commit both the .proto and the
# regenerated grpc_gen/ output together.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
PROTO_ROOT="${REPO_ROOT}/contracts/proto"
OUT_DIR="${AGENT_ROOT}/grpc_gen"

mkdir -p "${OUT_DIR}"

python -m grpc.tools.protoc \
  -I "${PROTO_ROOT}" \
  --python_out="${OUT_DIR}" \
  --grpc_python_out="${OUT_DIR}" \
  "${PROTO_ROOT}/agent/v1/agent.proto" \
  "${PROTO_ROOT}/tools/v1/tool.proto"

# The generated modules import each other as `from grpc_gen.<pkg>.v1 import
# ...`, so every directory under grpc_gen must be a Python package.
find "${OUT_DIR}" -type d ! -path '*/__pycache__' ! -name '__pycache__' -exec sh -c 'touch "$1/__init__.py"' _ {} \;

# grpc.tools.protoc derives the module path from the -I root, so the *_grpc
# stubs are emitted as `from agent.v1 import ...`. They are generated inside
# the grpc_gen package, so rewrite those imports to the package-qualified form.
find "${OUT_DIR}" -name '*_pb2_grpc.py' -exec sed -i -E 's/^from (agent|tools)\.v1 import/from grpc_gen.\1.v1 import/' {} +

echo "gRPC stubs regenerated in ${OUT_DIR}"