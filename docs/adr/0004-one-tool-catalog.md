# One generated tool catalog

Tool metadata exists in three places: `contracts/src/generated/tools.json`, the `back` zod schemas plus `toolMeta.ts`, and hand-written Python lists and descriptions in `ecom_agent/tools/`. The JSON is generated from `back`, but Python does not consume it, and nothing checks parity. The gRPC payloads carry JSON strings, so the proto adds ceremony without type safety.

We keep `back` as the source of truth and keep the generated JSON, extended with ask templates and write/idempotency flags. Python types and descriptions are generated from that JSON. CI regenerates and fails on drift. gRPC messages become typed (explicit messages per tool) or, as a fallback, validated `Struct` with generated JSON Schema on both sides.

The tool surface also shrinks from 11 to 7. `selectProduct` becomes session state, `getProductDetails` is covered by `searchProducts`, `suggestProducts` becomes prompt behavior over `searchProducts`, `calculateShipping` folds into `quoteOrder`, and `modifyOrder` is removed until usage justifies it.

## Considered options

- **Keep three copies and add a parity test.** Fixes drift but not the cost of three edits per change.
- **Drop the proto and use HTTP/JSON.** Simpler to debug, but throws away a working boundary and codegen; the problem is the payload shape, not the transport.
- **One catalog, generated types, typed payloads.** Chosen.

## Consequences

- Changing a tool means editing the zod schema and metadata, then regenerating. One edit site, two generated outputs.
- Removing a tool is a contract change: keep the `back` implementation until the agent stops calling it, then delete.
- The contract test becomes a required CI job.
- `docs/grpc-contract.md` is generated from the proto.
