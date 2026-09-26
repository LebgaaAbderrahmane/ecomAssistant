# gRPC Contract

Service-to-service boundary between the backend (`back`) and the Python agent
(`ecom_agent`). Both sides read the same `.proto` files from
`contracts/proto/` (see [docs/grpc-ts-loading.md](grpc-ts-loading.md)).

| Service | Package | Served by | Reached as | Host port |
| --- | --- | --- | --- | --- |
| `AgentService` | `ecomassistant.agent.v1` | ecom_agent | `agent:50052` | none (internal only) |
| `ToolService` | `ecomassistant.tools.v1` | back | `back:50051` | none (internal only) |

Both ports are container-internal. They are never published to the host
(docker-compose exposes only HTTP/API ports).

## Authentication

Every RPC except `AgentService.Health` requires the internal shared secret:

    authorization: Bearer <INTERNAL_API_KEY>

The same `INTERNAL_API_KEY` is used on both services (set once in `.env`).
`AgentService.Health` is intentionally unauthenticated so orchestration tooling
(the ecom_agent container healthcheck) can probe liveness without the key.
`ToolService.Health` *does* require auth — the container healthcheck for back
uses the HTTP `/health` endpoint instead.

## Health semantics

Health is a single unary RPC on both services:

    rpc Health(HealthRequest) returns (HealthResponse);
    message HealthResponse { Status status = 1; }  // STATUS_SERVING = 1

### AgentService.Health

- **No auth required.**
- Returns `STATUS_SERVING` unconditionally once the gRPC server is bound.
- Probed by `ecom_agent/healthcheck.py` (docker healthcheck) every 30s.

### ToolService.Health

- **Auth required** (`authorization: Bearer INTERNAL_API_KEY`).
- Returns `STATUS_SERVING` unconditionally once bound; `PERMISSION_DENIED` if
  the auth header is missing/invalid.

`STATUS_NOT_SERVING` is defined in the proto for future use; neither service
currently emits it (liveness, not readiness).

## ToolService.ExecuteTool

    rpc ExecuteTool(ExecuteToolRequest) returns (ExecuteToolResponse);

### Request

| Field | Type | Notes |
| --- | --- | --- |
| `tool_name` | string | One of the 11 contract tools (below). |
| `entities_json` | string | JSON object of agent-supplied arguments. |
| `identity` | Identity | `conversation_id` (required), `merchant_id`, `customer_id`. |

`identity` selects the conversation row, which is the **authoritative scope**:
merchant/customer are materialized from the row, and a mismatched
`merchant_id`/`customer_id` is rejected (cross-tenant guard).

### Response

Successful gRPC status (0/OK) does **not** mean the tool business step
succeeded. The business outcome is carried in the body:

| Field | Type | Meaning |
| --- | --- | --- |
| `success` | bool | True = tool completed; false = recoverable failure. |
| `outcome` | enum | `OUTCOME_SUCCESS` / `OUTCOME_NOT_FOUND` / `OUTCOME_AMBIGUOUS` / `OUTCOME_UNSPECIFIED`. |
| `data_json` | string | JSON result payload (shapes below). |
| `error` | string | Human/machine-readable failure detail (when `success=false`). |

`outcome` mapping from the tool layer:

| Backend outcome | Wire `outcome` | When |
| --- | --- | --- |
| `SUCCESS` | `OUTCOME_SUCCESS` | Tool ran and produced data. |
| `NOT_FOUND` | `OUTCOME_NOT_FOUND` | Item definitively absent (empty catalog, no order, unknown wilaya). |
| `AMBIGUOUS` | `OUTCOME_AMBIGUOUS` | Request too vague (reserved; no tool currently emits it). |
| *(absent)* | `OUTCOME_UNSPECIFIED` | Operational failure — bad args, missing context, human take-over gate. |

### gRPC status codes (hard errors)

Hard errors short-circuit the body with a non-OK status. These are contractually
stable:

| Code | Name | Meaning |
| --- | --- | --- |
| 3 | `INVALID_ARGUMENT` | Unknown tool name; tool not part of the agent contract; `identity.conversation_id` missing; `entities_json` is not a JSON object; merchant/customer id does not match the conversation. |
| 5 | `NOT_FOUND` | Conversation row or customer row not found. |
| 7 | `PERMISSION_DENIED` | Missing/invalid `INTERNAL_API_KEY` on the call. |
| 13 | `INTERNAL` | Unexpected execution failure (exception inside the handler). |

The recoverable-vs-hard split is deliberate: **business** failures (`NOT_FOUND`,
missing order, out of stock) come back as OK + `outcome`; **transport** failures
(bad identity, unknown tool, auth) come back as gRPC status codes.

### Recoverable failure payloads

On `success=false` with a gRPC OK status, `data_json` may still carry useful
context:

- `searchProducts` NOT_FOUND → `{"query": "..."}` alongside the `error`.
- All other failures → `"{}"` with the explanation in `error`.

### data_json shapes per tool

| Tool | `success=true` `data_json` shape |
| --- | --- |
| `searchProducts` | `{"products": [Product]}` — `Product = {id, name, price, currency, stockStatus}` |
| `selectProduct` | `{"productId", "productName", "price", "currency", "stockStatus", "description"}` |
| `getProductDetails` | `{"productId", "productName", "description", "price", "currency", "stockStatus", "category"}` |
| `suggestProducts` | `{"products": [Product], "recommended": true, "basedOn": "preferences" \| "popular"}` |
| `calculateShipping` | `{"wilaya", "cost"}` |
| `getOrderStatus` | `{"orderId", "status", "trackingNumber"}` |
| `createOrder` | `{"orderId", "productName", "quantity", "price", "totalAmount", "deliveryCost", "wilaya", "commune", "address"}` |
| `confirmOrder` | `{"orderId", "productName", "status"}` |
| `modifyOrder` | `{"orderId", "productName", "quantity", "wilaya", "commune", "deliveryCost", "totalAmount"}` |
| `cancelOrder` | `{"orderId", "productName", "status"}` |
| `escalateConversation` | `{"escalated": true, "reason"}` or `{"escalated": false}` (already taken over) |

### Human take-over gate

When the conversation `takenOverByHuman` is true, **read tools** are suppressed
and return an OK response with `success=false`,
`outcome=OUTCOME_UNSPECIFIED`, `data_json="{}"`, and
`error="Conversation is under human takeover; read tools are suppressed"`.
**Write tools** still execute.

## AgentService.ProcessMessage

    rpc ProcessMessage(ProcessMessageRequest) returns (ProcessMessageResponse);

| Field | Type | Notes |
| --- | --- | --- |
| `message_id` | string | Inbound WhatsApp message row id (required; empty → `NOT_FOUND`). |
| `conversation_id` | string | Conversation scope; becomes the LangGraph thread id. |
| `merchant_id` / `customer_id` | string | Scoped identity for tool calls. |

`decision` controls what the backend does with the reply:

| Decision | Meaning |
| --- | --- |
| `DECISION_REPLY` | Agent produced `text`; backend sends it to the customer and persists it. |
| `DECISION_ESCALATE` | Agent wants a human (empty reply text, graph error, or non-customer message); backend sets `takenOverByHuman`. |

Auth failure → `UNAUTHENTICATED` (code 16); empty `message_id` → `NOT_FOUND` (5).

## Observability

Structured logs (pino, JSON) are emitted for every RPC with the following
fields:

| Field | ToolService.ExecuteTool | AgentService.ProcessMessage |
| --- | --- | --- |
| `area` | `grpc` | `grpc` |
| `rpc` | `ToolService.ExecuteTool` | `AgentService.ProcessMessage` |
| `tool` | tool name | — |
| `conversationId` | conversation id | conversation id |
| `outcome` | `OUTCOME_*` or `OK` on status OK | `decision` |
| `messageId` | — | message id |
| `ms` | handler elapsed ms | call elapsed ms |
| `code` | gRPC status code (errors only) | gRPC status code (errors only) |

Sensitive ids in `logger`/`grpcLogger` bindings are redacted (authorization
headers, keys); message *text* is never logged on the wire.