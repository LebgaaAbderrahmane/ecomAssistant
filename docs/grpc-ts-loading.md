# TypeScript gRPC loading strategy (no codegen)

The TypeScript side never compiles protobufs into `.pb.js`/`.d.ts` at build
time. Protos are loaded **at runtime** from the `@ecomassistant/contracts`
package (the single source of truth for contracts) using:

- [`@grpc/grpc-js`](https://www.npmjs.com/package/@grpc/grpc-js) — the channel,
  call, server runtime.
- [`@grpc/proto-loader`](https://www.npmjs.com/package/@grpc/proto-loader) —
  parses `.proto` files and produces a `PackageDefinition` that
  `grpc.loadPackageDefinition()` can consume without any generated code.

Protos never leave `contracts/proto/…`; both sides read the same files.

## Where the protos live

    contracts/proto/
      agent/v1/agent.proto   → package ecomassistant.agent.v1 (AgentService)
      tools/v1/tool.proto    → package ecomassistant.tools.v1 (ToolService)

Because `contracts` is a pnpm workspace package, from inside the backend the
files resolve to **`node_modules/@ecomassistant/contracts/proto/…`** (the
workspace symlink points at the real `contracts/` directory, so this is the
same path in dev and in a packed install).

## Resolving the proto root at runtime

`import.meta.url` points at the loader source, not at `node_modules/`, so the
root is resolved through the package name — this survives symlinks, packing,
and moving the workspace:

```ts
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const contractsPackageJson = require.resolve('@ecomassistant/contracts/package.json');
const contractsRoot = dirname(contractsPackageJson);
const PROTO_ROOT = join(contractsRoot, 'proto');
const AGENT_PROTO = join(PROTO_ROOT, 'agent/v1/agent.proto');
const TOOLS_PROTO = join(PROTO_ROOT, 'tools/v1/tool.proto');
```

## Loading a service

```ts
import { loadSync } from '@grpc/proto-loader';
import * as grpc from '@grpc/grpc-js';

const options: Options = {
  includeDirs: [PROTO_ROOT],
  keepCase: false,          // camelCase field keys
  longs: String,            // int64 → string (matches id fields)
  enums: String,            // enums arrive as their string name
  defaults: true,
  oneofs: true,
};

const definition = loadSync(AGENT_PROTO, options);
const proto = grpc.loadPackageDefinition(definition) as unknown as Ecomassistant.agent.v1;
```

`Ecomassistant.agent.v1` is the namespace typed in `contracts/src/grpc/types.ts`.
Since we deliberately do not run `proto-loader-gen-types` (no codegen), the
request/response shapes are tiny hand-written interfaces that mirror the proto
(`ProcessMessageRequest`, `ProcessMessageResponse`, …). The proto remains the
contract; these interfaces are a thin static view of it.

## Who loads what

| Service | Who serves | Who calls | Loads from |
| --- | --- | --- | --- |
| `ecomassistant.agent.v1.AgentService` | Python agent (T4) | backend (T3) | `AGENT_PROTO` |
| `ecomassistant.tools.v1.ToolService` | backend (T10) | Python agent | `TOOLS_PROTO` |

- Backend → agent client: `new AgentServiceClient(AGENT_GRPC_ADDR)` with the
  metadata interceptor attaching `INTERNAL_API_KEY` to every call.
- Backend tool server: `grpc.Server.addService(AgentServiceService, impl)`,
  listening on `TOOLS_GRPC_ADDR` (container-internal, no host port).

Both directions reuse the same `PROTO_ROOT` resolution, so adding a service is
one `.proto` file + one loader call — no build step to forget.

## Why this strategy

- **Single source of truth.** Both services execute the exact same `.proto`
  bytes committed to `contracts/`.
- **No build chain.** No protoc invocation, no generation step in CI, no
  committed `.pb.js` drift. The `.proto` is the artifact.
- **Python parity.** The agent side generates python stubs with `grpcio-tools`
  (its own tooling); TS side just concatenates the same files at runtime.