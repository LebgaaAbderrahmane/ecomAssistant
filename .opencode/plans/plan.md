# V1 Architecture Migration Plan

## Target: `Conversation_Orchestration_Flow_v11.md`
## Timeline: 7 days x ~12 hours = 84 hours
## Status: Plan — Awaiting Approval

---

# 1. Current → Target Migration Analysis

## 1.1 What Can Be Reused (no changes needed)

| Component | File | Notes |
|-----------|------|-------|
| LLM client (Gemini) | `clients/gemini.client.ts` | Key rotation, works as-is |
| Intent extraction LLM call | `intentExtraction.service.ts` | Reused by Orchestrator |
| Reply generation LLM call | `generateResponse.ts` | Minor refactor for responseKey |
| Prompt builders | `prompts/systemPrompts.ts`, `prompts/promptBuilder.ts` | Extend with flow memory context |
| Intent schemas | `schemas/intents.schemas.ts` | Add dependency field |
| Tool registry (tool handlers) | `tools/registry.ts` | Extract into separate files |
| Search helpers | `tools/searchHelpers.ts` | Reused as-is |
| Suggestion helpers | `tools/suggestionHelpers.ts` | Reused as-is |
| Layer2 job kind decision | `layer2JobKind.ts` | Pure function, reused as-is |
| Text preprocessing | `textPreprocessing.ts` | Reused as-is |
| Empty message guard | `emptyMessageGuard.ts` | Reused as-is |
| Product resolution | `productResolution.ts` | Reused as-is |
| Media services | `media/transcription.service.ts`, `media/imageCaption.service.ts` | Reused as-is |
| WhatsApp send/receive | `whatsapp/whatsapp.service.ts`, `whatsapp/conversation.service.ts` | Add structured logging |
| BullMQ queues (message, layer2, email) | `queues/*.ts` | Add generation to layer2 payload |
| Email worker | `workers/email.worker.ts` | No changes |
| Shared types/schemas/utils | `shared/src/*` | Add new fields to types |

## 1.2 What Must Be Refactored

| Component | Current | Target | Reason |
|-----------|---------|--------|--------|
| `agent.service.ts` | 221-line god orchestrator | Orchestrator with lock, idempotency, generation check | v11 invariants require it |
| `executeTools.ts` | Tool execution + post-processing + memory | FlowProcessor wrapper around tool execution | State must commit between intents |
| `generateResponse.ts` | Inline response generation | Response generation with durable responseKey | Prevent duplicate responses |
| `escalation.ts` | Inline threshold check + notification | Escalation with durable escalationEvent | v11 requires escalationEventId |
| `memoryPersistence.ts` | End-of-pipeline memory update | Flow memory committed per state tool | State tools commit before next intent |
| `conversationState.ts` | Pure functions, never called | Called by FlowProcessor for state commits | State must be explicit |
| `message.worker.ts` | Simple processMessage call | Claim + lock + orchestrate | Idempotency required |
| `layer2.worker.ts` | Simple processDeferredLayer2 call | Lock + generation check + orchestrate | v11 Layer2 flow |
| `whatsapp.controller.ts` (message.sent) | Cancel layer2 jobs only | Full merchant engagement flow | v11 merchant message handling |
| `tools/registry.ts` | 933-line god file | Split into separate tool modules | Maintainability |

## 1.3 What Must Be Rewritten

| Component | Why |
|-----------|-----|
| Conversation lock (new) | Does not exist. Redis lease-based lock with heartbeat. |
| Idempotency claim (new) | Does not exist. Atomic messageId claim. |
| FlowResolver (new) | Does not exist. Routes intents to processors. |
| FlowProcessor (new) | Does not exist. Wraps tool execution with state commits. |
| Unified UNKNOWN handler (new) | Does not exist. Handles unknown intents in both paths. |
| Merchant engagement flow (new) | Current is a stub. Full lock + generation + context extraction. |
| Stale takeover sweep (new) | Does not exist. Periodic recovery job. |
| Structured logger (new) | Does not exist. Replaces console.log. |

## 1.4 What Must Be Deleted

| Component | Why |
|-----------|-----|
| Dead `eventBus.ts` | Never imported or used |
| Dead `orderConfirmation.service.ts` logic | `enqueueOrderJob` is commented out; defer to V2 |
| `ConversationOwner` enum usage in AI pipeline | `takenOverByHuman` is the working field; `owner` stays for display only |

---

# 2. Implementation Boundaries

## 2.1 Component Responsibilities

### ConversationLock
- **Responsibility**: Acquire/release lease-based lock on conversationId
- **Boundary**: Pure infrastructure — no business logic
- **Interface**: `acquireLock(conversationId, holder, leaseMs) → LockHandle`, `releaseLock(handle)`

### IdempotencyClaim
- **Responsibility**: Prevent duplicate processing of the same messageId
- **Boundary**: Pure infrastructure — atomic claim via Redis SET NX EX
- **Interface**: `claimMessageProcessing(messageId) → { claimed: boolean, alreadyProcessed: boolean }`

### Orchestrator
- **Responsibility**: Main pipeline — claim, save message, extract intents, acquire lock, run flow, generate response, release lock
- **Boundary**: Orchestration only — no business logic, no DB queries beyond data loading
- **File**: Refactored `agent.service.ts`

### FlowResolver
- **Responsibility**: Route each intent to the correct processor (STATE, QUERY, SOCIAL, FAQ, UNKNOWN)
- **Boundary**: Pure routing — no execution
- **Interface**: `resolveFlow(intent, context) → FlowProcessor`

### FlowProcessor
- **Responsibility**: Execute a single intent's tool, commit state, return result
- **Boundary**: Wraps tool execution with state-commit semantics
- **Interface**: `process(intent, context) → { success, stateCommitted, result }`

### ToolHandlers (split from registry.ts)
- **Responsibility**: Individual tool business logic
- **Boundary**: Each tool is a standalone function — receives context, returns result, does NOT update conversation state (FlowProcessor handles that)
- **Files**: `tools/searchProducts.ts`, `tools/createOrder.ts`, etc.

### UnifiedUnknownHandler
- **Responsibility**: Handle UNKNOWN_INTENT in both AI-owned and takeover paths
- **Boundary**: Escalation + suggestion analytics + policy decision
- **Interface**: `handleUnknown(message, context) → { policy: 'silent' | 'handoff', escalationCreated }`

### MerchantEngagement
- **Responsibility**: Process merchant messages — lock, increment generation, clear suppressAutoReply, extract context, merge into memory
- **Boundary**: Separate from customer message pipeline
- **File**: New module `modules/ai/merchantEngagement.ts`

### Layer2Processor
- **Responsibility**: Execute deferred Layer 2 — lock, generation check, read tools, generate response or suppress
- **Boundary**: Runs in worker, acquires own lock
- **File**: Refactored from `processDeferredLayer2` in agent.service.ts

### StaleTakeoverSweep
- **Responsibility**: Periodic scan for conversations stuck in takeover without pending Layer2 jobs
- **Boundary**: Recovery only — creates fresh Layer2 jobs
- **File**: New module `modules/ai/staleTakeoverSweep.ts`

### Logger
- **Responsibility**: Structured logging with conversationId, messageId, generation, jobId, flowId
- **Boundary**: Infrastructure — no business logic
- **File**: `lib/logger.ts`

## 2.2 What Must NOT Happen

- Tools must NOT update conversation state directly (FlowProcessor handles it)
- Orchestrator must NOT contain business logic (delegates to FlowResolver/FlowProcessor)
- Workers must NOT contain business logic (call Orchestrator only)
- LLM calls must NOT control state transitions (deterministic code does)
- WhatsApp send must NOT be inside tool execution (happens at pipeline end)

---

# 3. Approved Type Definitions

## 3.1 Logger (adopt existing `lib/logger.ts`)

```typescript
// Already exists at back/src/lib/logger.ts
import pino from 'pino'

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'info')

export const logger = pino({
  level,
  ...(process.env.NODE_ENV === 'development' && {
    transport: {
      target: 'pino-pretty',
      options: { colorize: true, translateTime: 'SYS:standard', ignore: 'pid,hostname' },
    },
  }),
})

export type Bindings = Record<string, string | number | boolean | undefined>

export function createChildLogger(bindings: Bindings): pino.Logger {
  return logger.child(bindings)
}
```

**Usage**: Every module creates a child logger with relevant bindings:
```typescript
const log = createChildLogger({ module: 'orchestrator', conversationId, messageId });
```

## 3.2 ConversationMemory (target structure)

```typescript
type ConversationMemory = {
  globalInformation: {
    customerName?: string;
    wilaya?: Wilaya;
    commune?: Commune;
  };
  flows: Flow[];
  activeFlow?: string; // flowId of the active flow
};
```

**Migration path**: On first read, if the shape doesn't match (old format), migrate in-place:
```typescript
function migrateMemory(raw: unknown): ConversationMemory {
  if (!raw || typeof raw !== 'object') return { globalInformation: {}, flows: [] };
  if ('globalInformation' in raw) return raw as ConversationMemory; // already migrated
  // Legacy migration
  const old = raw as Record<string, unknown>;
  return {
    globalInformation: {
      customerName: old.customerName as string | undefined,
      wilaya: old.entities?.wilaya as Wilaya | undefined,
      commune: old.entities?.commune as Commune | undefined,
    },
    flows: [], // no active flows from legacy data
    activeFlow: undefined,
  };
}
```

## 3.3 Flow and FlowState

```typescript
type FlowState =
  | "IDLE"
  | "PRODUCT_DISCOVERY"
  | "PRODUCT_SELECTED"
  | "ORDER_PENDING"
  | "ORDER_CONFIRMED"
  | "ORDER_SHIPPED"
  | "ORDER_CANCELLED"
  | "FINISHED";

type Flow = {
  flowId: string;
  state: FlowState;
  createdAt: Date;
  updatedAt: Date;
  productDiscovery?: {
    input: {
      productName: string;
      filters: Filter;
    };
    toolResults: Product[];
  };
  order?: {
    orderId: string | null;
    productId?: string;
    quantity?: number;
  };
  shipping: {
    // will be added later
  };
};
```

**Mapping from old ConversationState to FlowState**:
| Old ConversationState | New FlowState | Notes |
|---|---|---|
| `IDLE` | `IDLE` | No active flow |
| `GREETING` | `IDLE` | Greeting is transient, not a flow state |
| `PRODUCT_DISCOVERY` | `PRODUCT_DISCOVERY` | Searching for products |
| `PRODUCT_SELECTED` | `PRODUCT_SELECTED` | Product chosen, not yet ordered |
| `WAITING_CONFIRMATION` | `ORDER_PENDING` | Order placed, awaiting confirm |
| `CONFIRMED` | `ORDER_CONFIRMED` | Order confirmed |
| `SHIPPING` | `ORDER_SHIPPED` | Order shipped |
| `FINISHED` | `FINISHED` | Conversation complete |
| `CANCELLED` | `ORDER_CANCELLED` | Order cancelled |

**Each Flow is independent**: A conversation can have multiple flows (e.g., browse shoes → order shoes → browse phones). Only `activeFlow` points to the currently relevant one. Previous flows remain in `flows[]` for history and memory.

## 3.4 Product, Variants, Filter (flow memory context)

```typescript
type Variants = {
  id: string;
  name: string;
  price: number;
  sku?: string;
  stock?: number;
  options?: Record<string, string>; // e.g. { color: "black", size: "42" }
};

type Product = {
  productId: string;
  productName: string;
  price: number;
  variants: Variants[];
};

type Filter = {
  category?: string;
  color?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  preferences?: string;
};
```

## 3.5 FlowResolverInput

```typescript
type FlowResolverInput = {
  extraction: {
    intent: string;
    category: "STATE_INTENT" | "QUERY_INTENT";
    entities: {
      productRef?: string;       // raw, unresolved ("the second one")
      productName?: string;
      orderRef?: string;         // raw, unresolved ("my iPhone order")
      orderId?: string;
      confirmationSignal?: "confirm" | "cancel" | "modify" | null;
      quantity?: number;
      wilaya?: string;
      commune?: string;
      reason?: string;           // for COMPLAINT / REQUEST_RETURN
    };
    confidence: number;
  };
  conversation: {
    activeFlowId: string | null;
    flows: Flow[];                // all flows, all statuses included
  };
};
```

## 3.6 FlowResolverOutput

```typescript
type FlowResolverOutput =
  | { type: "CONTINUE"; flowId: string }
  | { type: "SWITCH"; flowId: string }
  | { type: "CREATE" }
  | { type: "CLARIFY"; candidates: FlowCandidate[] }
  | { type: "INVALID_ACTION"; reason: string }
  | { type: "NO_FLOW_LOOKUP" };
```

**Resolver logic**:
- `CONTINUE` — intent belongs to the currently active flow (e.g., order confirm on an existing order flow)
- `SWITCH` — intent belongs to a different existing flow (e.g., new product search while an order flow is active)
- `CREATE` — intent doesn't match any existing flow, create a new one
- `CLARIFY` — multiple flows match, need to ask which one
- `INVALID_ACTION` — intent is valid but can't execute in current state (e.g., confirm when no order exists)
- `NO_FLOW_LOOKUP` — intent doesn't need flow resolution (SOCIAL, FAQ, ESCALATION)

## 3.7 FlowCandidate

```typescript
type FlowCandidate = {
  flowId: string;
  score: number;
  matchedSignals: string[];       // e.g. ["explicitReference", "recency"]
  summary: string;                // e.g. "iPhone 14, qty 2" — for LLM #2 to phrase CLARIFY
};
```

**Signal types for scoring**:
| Signal | Weight | Description |
|---|---|---|
| `explicitReference` | 3 | Customer named the product/order explicitly |
| `recency` | 2 | Most recently updated flow |
| `entityOverlap` | 1 | Entities (product name, wilaya) overlap with flow |
| `stateMatch` | 1 | Intent naturally continues this flow's state |

## 3.8 Domain and Infrastructure Types

```typescript
// ─── Domain errors (expected, handled) ──────────────────────────────────
type DomainError =
  | { code: 'MESSAGE_ALREADY_CLAIMED'; messageId: string }
  | { code: 'LOCK_ACQUISITION_FAILED'; conversationId: string; waitMs: number }
  | { code: 'GENERATION_STALE'; expected: number; actual: number; conversationId: string }
  | { code: 'TOOL_EXECUTION_FAILED'; tool: string; reason: string; messageId: string }
  | { code: 'LLM_PARSE_FAILED'; raw?: string }
  | { code: 'INTENT_EXTRACTION_FAILED'; reason: string }
  | { code: 'ESCALATION_THRESHOLD_REACHED'; conversationId: string; count: number; threshold: number }
  | { code: 'UNKNOWN_INTENT'; intent: string; conversationId: string }
  | { code: 'SUPPRESS_AUTO_REPLY'; conversationId: string }
  | { code: 'FLOW_RESOLUTION_FAILED'; reason: string; intent: string }
  | { code: 'EMPTY_MESSAGE'; messageId: string }
  | { code: 'CUSTOMER_BLOCKED'; customerId: string }
  | { code: 'NO_WHATSAPP_SESSION'; merchantId: string };

// ─── Infrastructure errors (unexpected, alert-worthy) ───────────────────
type InfraError =
  | { code: 'DATABASE_UNAVAILABLE'; operation: string }
  | { code: 'REDIS_UNAVAILABLE'; operation: string }
  | { code: 'LLM_API_UNAVAILABLE'; attemptCount: number }
  | { code: 'WHATSAPP_SEND_FAILED'; conversationId: string; error: string }
  | { code: 'LOCK_LEASE_EXPIRED'; conversationId: string; holder: string }
  | { code: 'QUEUE_ENQUEUE_FAILED'; queue: string; jobId: string }
  | { code: 'WORKER_CRASH'; workerId: string; jobId: string };
```

## 3.9 Conversation Lock Types

```typescript
type LockHandle = {
  lockId: string;                  // random UUID to prevent releasing someone else's lock
  conversationId: string;
  holder: string;                  // identifier for who holds the lock
  acquiredAt: number;              // Date.now()
  extend: () => Promise<void>;     // heartbeat: extend lease
  release: () => Promise<void>;    // release lock (Lua script: check + delete)
};

type LockOptions = {
  leaseMs?: number;                // default 15_000 (15 seconds)
  retryMs?: number;                // default 100 (retry interval for acquisition)
  retryTimeoutMs?: number;         // default 5_000 (max time to wait for lock)
};

type LockHolder =
  | 'orchestrator'                  // main pipeline
  | 'layer2'                        // Layer 2 processor
  | 'merchant-engagement';          // merchant message handler
  // Block A does NOT acquire — inherits from orchestrator
```

**Redis key format**: `lock:conversation:{conversationId}`
**Redis value**: `{ lockId, holder, acquiredAt }` (JSON string)
**Lua release script**:
```lua
local key = KEYS[1]
local expectedLockId = ARGV[1]
local currentLockId = redis.call('GET', key)
if currentLockId == expectedLockId then
  return redis.call('DEL', key)
else
  return 0
end
```

## 3.10 Message Claim Types

```typescript
type ClaimResult = {
  claimed: boolean;
  reason?: 'already_claimed' | 'already_completed' | 'already_failed';
};

type MessageClaim = {
  messageId: string;
  claimedAt: Date;
  claim Holder: string;            // worker ID or process identifier
  processingGeneration: number;    // layer2Generation at claim time (for audit)
};
```

**Claim mechanism**: `UPDATE Message SET claimedAt = NOW() WHERE id = ? AND claimedAt IS NULL`
- Returns 1 row affected → claimed successfully
- Returns 0 rows → already claimed or completed
- This is a single atomic SQL statement — no race possible

## 3.11 Intent and Tool Types (existing, carried forward)

```typescript
// From schemas/intents.schemas.ts — unchanged
type Intent =
  | 'PRODUCT_SEARCH' | 'PRODUCT_SELECT' | 'PRODUCT_DETAILS' | 'PRODUCT_SUGGEST'
  | 'ORDER_CREATE' | 'ORDER_CONFIRM' | 'ORDER_MODIFY' | 'ORDER_CANCEL'
  | 'SHIPPING_CHECK' | 'STATUS_CHECK'
  | 'ESCALATION' | 'OUT_OF_SCOPE' | 'GOODBYE';

type ConversationAct =
  | 'NORMAL' | 'AFFIRM' | 'NEGATE' | 'DIDNT_UNDERSTAND' | 'FRUSTRATED' | 'CHANGE_TOPIC';

type SuggestedIntentField = {
  suggested: true;
  name: string;
  description: string;
};

type IntentField = Intent | SuggestedIntentField;

// From schemas/ai.schemas.ts — unchanged
type IntentItem = {
  intent: IntentField;
  entities: Record<string, string | number | boolean | null>;
  confidence: number;
  order: number;                    // 1-4, execution order
  status: 'resolved' | 'unresolved';
  candidates: string[] | null;
  unresolvedReason: string | null;
};

type LLMResponse = {
  intents: IntentItem[];
  conversationAct: ConversationAct;
};

type ReplyResponse = {
  messages: string[];               // 1-3 WhatsApp messages
};
```

## 3.12 Tool Types (existing, carried forward)

```typescript
type ReadToolName =
  | 'searchProducts' | 'recallPreviousProducts' | 'chooseProduct'
  | 'getProductDetails' | 'suggestProducts'
  | 'calculateShipping' | 'getOrderStatus';

type WriteToolName =
  | 'createOrder' | 'confirmOrder' | 'modifyOrder'
  | 'cancelOrder' | 'escalateConversation';

type ToolName = ReadToolName | WriteToolName;

type ToolOutcome = 'SUCCESS' | 'NOT_FOUND' | 'AMBIGUOUS';

type ToolResult = {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  outcome?: ToolOutcome;
};

type ToolExecutionContext = {
  merchantId: string;
  customerId: string;
  conversationId: string;
  currentOrderId: string | null;
  currentProductId: string | null;
  lastProductResults?: Array<{ id: string; name: string }>;
  customerWilaya?: string | null;
  customerCommune?: string | null;
};
```

## 3.13 Layer 2 Types

```typescript
type Layer2JobKind = 'execute-read-tools' | 'generate-response';

type Layer2JobData = {
  messageId: string;
  conversationId: string;
  generation: number;               // layer2Generation when job was enqueued
};

// Job ID format: layer2:{conversationId}:{generation}
// This ensures at most one active Layer2 job per conversation.

type Layer2ReplyState = {
  sortedIntents: IntentItem[];
  primaryIntent: IntentItem;
  conversationAct: string;
  rejectedToRecord?: Array<{ id: string; name: string }>;
  tone: string;
  language: string;
  replyMemory: ConversationMemory;
  finalLastProductResults?: Array<{ id: string; name: string }>;
};

type ToolResultEntry = {
  intent: string;
  result: ToolResult | null;
};
```

## 3.14 Escalation Event Types

```typescript
type EscalationReason =
  | 'FRUSTRATION_THRESHOLD'
  | 'UNCLASSIFIED'
  | 'EXPLICIT'
  | 'SUGGESTED_INTENT'
  | 'PAYMENT_PROOF'
  | 'DAMAGE_COMPLAINT';

type EscalationPolicy = 'silent' | 'handoff';

type EscalationEvent = {
  id: string;
  conversationId: string;
  reason: EscalationReason;
  status: 'ACTIVE' | 'RESOLVED';
  resolvedAt: Date | null;
  createdAt: Date;
};

// Notification key: conversationId:escalationEventId
// Ensures at most one notification per active escalation.
type NotificationKey = `${string}:${string}`;
```

## 3.15 Intent Category Mapping (for FlowResolver)

```typescript
type IntentCategory = 'STATE_INTENT' | 'QUERY_INTENT' | 'UNKNOWN_INTENT';

const INTENT_CATEGORY_MAP: Record<string, IntentCategory> = {
  PRODUCT_SEARCH: 'STATE_INTENT',
  PRODUCT_SELECT: 'STATE_INTENT',
  PRODUCT_DETAILS: 'QUERY_INTENT',
  PRODUCT_SUGGEST: 'QUERY_INTENT',
  ORDER_CREATE: 'STATE_INTENT',
  ORDER_CONFIRM: 'STATE_INTENT',
  ORDER_MODIFY: 'STATE_INTENT',
  ORDER_CANCEL: 'STATE_INTENT',
  SHIPPING_CHECK: 'QUERY_INTENT',
  STATUS_CHECK: 'QUERY_INTENT',
  ESCALATION: 'STATE_INTENT',
  OUT_OF_SCOPE: 'UNKNOWN_INTENT',
  GOODBYE: 'UNKNOWN_INTENT',
};
```

## 3.16 Wilaya and Commune

```typescript
type Wilaya = string;   // e.g. "Oran", "Alger", "Constantine"
type Commune = string;  // e.g. "Bir El Djir", "Bab Ezzouar"
```

## 3.17 File Locations for All Types

| Type | Target File | Notes |
|------|------------|-------|
| Logger, Bindings, createChildLogger | `lib/logger.ts` | Already exists, adopt everywhere |
| DomainError, InfraError | `lib/errors.ts` | New file |
| ConversationMemory, migrateMemory | `modules/ai/memory.types.ts` | Replace existing interface |
| Flow, FlowState, Filter, Product, Variants | `modules/ai/memory.types.ts` | New types |
| FlowResolverInput, FlowResolverOutput, FlowCandidate | `modules/ai/flowResolver.types.ts` | New file |
| IntentCategory, INTENT_CATEGORY_MAP | `modules/ai/flowResolver.types.ts` | New file |
| LockHandle, LockOptions, LockHolder | `lib/conversationLock.ts` | New file |
| ClaimResult, MessageClaim | `lib/idempotency.ts` | New file |
| Intent, IntentField, IntentItem, ConversationAct | `modules/ai/schemas/intents.schemas.ts` | Existing, unchanged |
| LLMResponse, ReplyResponse | `modules/ai/schemas/ai.schemas.ts` | Existing, unchanged |
| ToolResult, ToolExecutionContext, ToolOutcome | `modules/ai/tools/registry.ts` | Existing, unchanged |
| ToolName, ReadToolName, WriteToolName | `modules/ai/schemas/intents.schemas.ts` | Existing, unchanged |
| Layer2JobKind, Layer2JobData, Layer2ReplyState, ToolResultEntry | `modules/ai/layer2JobKind.ts` + `modules/ai/memory.types.ts` | Extend existing |
| EscalationEvent, EscalationReason, EscalationPolicy, NotificationKey | `modules/ai/escalationManager.ts` | New file |
| Wilaya, Commune | `modules/ai/memory.types.ts` | Simple aliases |

---

# 4. Database and Persistence Review

## 3.1 Fields to Add

### Conversation.layer2Generation (Int, default 0)
- **Why**: Authoritative stale-job guard. Incremented by merchant engagement and main pipeline. Layer2 re-reads under lock before side effects.
- **Writer**: Merchant engagement flow, Main pipeline (when enqueueing Layer2)
- **Reader**: Layer2 processor (under lock), Stale sweep
- **Lifecycle**: Incremented on every merchant message and every customer message that enqueues Layer2. Never decremented.
- **Invariant**: If job.generation !== conversation.layer2Generation, job is stale and must abort.
- **Index**: No additional index needed (read under conversation lock)
- **Cannot be avoided**: Core v11 invariant #10

### Conversation.suppressAutoReply (Boolean, default false)
- **Why**: Single canonical suppression flag. When true, Layer2 executes query tools but does NOT generate a response.
- **Writer**: Unified UNKNOWN handler (sets true), Merchant engagement (clears on close)
- **Reader**: Layer2 processor, Main pipeline (final response decision)
- **Lifecycle**: Set by UNKNOWN handler with silent policy. Cleared when merchant engages and closes the silent window.
- **Invariant**: Only cleared by merchant engagement, never by Layer2.
- **Cannot be avoided**: Core v11 invariant #24

### Conversation.escalationEventId (String?, optional)
- **Why**: Durable escalation event ID. Every active escalation reuses the same event ID. Notifications are keyed by `conversationId:escalationEventId`.
- **Writer**: getOrCreateActiveEscalationEvent
- **Reader**: Notification outbox, Dashboard escalation view
- **Lifecycle**: Created when first escalation happens. Cleared when conversation is de-escalated (Layer2 after successful response).
- **Invariant**: At most one active escalationEventId per conversation (v11 invariant #20).
- **Index**: No additional index needed
- **Can be partially avoided**: V1 could use timestamp, but event ID is needed for notification idempotency

### Message.processingState (enum: PENDING | CLAIMED | COMPLETED | FAILED, default PENDING)
- **Why**: Idempotency claim mechanism. Atomic claim prevents duplicate processing.
- **Writer**: Idempotency claim (PENDING→CLAIMED), Orchestrator (CLAIMED→COMPLETED/FAILED)
- **Reader**: Idempotency claim check, Recovery sweep
- **Lifecycle**: Set to CLAIMED atomically when worker picks up. Set to COMPLETED after successful processing. Set to FAILED on unrecoverable error.
- **Index**: No additional index needed (queried by messageId PK)
- **Cannot be avoided**: Core v11 invariant #19

### Message.responseKey (String?, optional)
- **Why**: Durable response window key. Each response is keyed to prevent duplicate sends.
- **Writer**: Main pipeline when generating response
- **Reader**: Response dedup check
- **Lifecycle**: Set when response is generated and sent. Checked before sending.
- **Index**: Unique index on (conversationId, responseKey) for dedup
- **Can be avoided in V1**: Low risk without it since lock serializes, but adds safety

## 3.2 Fields That Already Exist and Are Reused

| Field | Current Use | Target Use |
|-------|-------------|------------|
| `Conversation.takenOverByHuman` | Boolean, set by escalation | Same — Block A + threshold escalation |
| `Conversation.escalatedAt` | Timestamp of last escalation | Same — used for staleness detection |
| `Conversation.state` | ConversationState enum | Same — committed by FlowProcessor |
| `Conversation.memory` | JSON blob | Same — but committed per state tool instead of end-of-pipeline |
| `Conversation.followUpStep` | Follow-up counter | Same — used by follow-up system |
| `Message.parsedIntents` | JSON array of extracted intents | Same — read by Block A and Layer2 |
| `Message.toolResults` | JSON of tool execution results | Same — write tools persist here for Layer2 merge |

## 3.3 Fields That Stay Unused (V2)

| Field | Reason |
|-------|--------|
| `AgentConfig.followUpDelays` | Follow-up scheduling deferred to V2 |
| `AgentConfig.maxFollowUps` | Follow-up scheduling deferred to V2 |
| `AgentConfig.templates` | Template management deferred to V2 |
| `Conversation.owner` (enum) | Display-only; `takenOverByHuman` is the working field |

## 3.4 Required Migration

One Prisma migration adding:
- `layer2Generation` Int @default(0) to Conversation
- `suppressAutoReply` Boolean @default(false) to Conversation
- `escalationEventId` String? to Conversation
- `processingState` enum (PENDING, CLAIMED, COMPLETED, FAILED) to Message
- `processingState` field to Message with default PENDING
- `responseKey` String? to Message

No existing fields removed or renamed.
No data migration needed (all new fields have defaults).

---

# 5. Concurrency Correctness

## 5.1 Conversation Lock (Lease-based)

**Implementation**: Redis SET NX EX with periodic heartbeat extension.

```
Key:    lock:conversation:{conversationId}
Value:  { holder: string, leaseId: string, acquiredAt: number }
TTL:    30 seconds (lease)
Heartbeat: Every 10 seconds, extend TTL if holder matches
```

**Who acquires it**:
1. Main Pipeline (customer message) — acquired after idempotency claim, before flow execution
2. Merchant engagement — acquired before incrementing generation
3. Layer2 processor — acquired before executing deferred tools
4. Stale sweep — uses atomic transaction, not lock

**Who does NOT acquire it**:
- Block A (inherits lock from Main Pipeline — v11 invariant #17)

**What happens under the lock**:
- All conversation state reads/writes
- All tool execution (state tools)
- Memory updates
- Generation increment
- Layer2 enqueue/cancel
- Response generation and send

**What happens outside the lock**:
- Message save (before lock acquisition)
- Intent extraction (LLM #1) — pure computation, no shared state
- WhatsApp send (after lock release, if responseKey dedup is used)
- Suggested intent recording
- Stale sweep (uses atomic DB transactions)

## 5.2 TOCTOU Analysis

| Race | Protection |
|------|------------|
| Two messages claim same messageId | Atomic Redis SET NX EX — only one wins |
| Two messages acquire lock for same conversation | Second message blocks on lock acquisition, then re-reads state |
| Layer2 reads stale generation | Re-reads generation UNDER LOCK before side effects |
| Merchant sends while Layer2 running | Merchant blocks on same lock; when Layer2 releases, merchant increments generation before any work |
| Worker crash mid-lock | Lock TTL expires (30s), lock becomes available; stalled job BullMQ retry re-processes |
| Lock heartbeat fails | TTL expires, another worker can acquire; original worker's in-flight work is now operating on stale lock — but generation check in Layer2 catches this |

## 5.3 Atomicity Requirements

| Operation | Atomicity Mechanism |
|-----------|-------------------|
| Message idempotency claim | Redis SET NX EX (single command) |
| Lock acquisition | Redis SET NX EX (single command) |
| Lock release | Lua script (check holder + delete) |
| Generation increment | Prisma `UPDATE ... SET layer2Generation = layer2Generation + 1 WHERE id = ?` (single SQL) |
| State tool commit | Prisma transaction (update order + update conversation.state + update conversation.memory) |
| Layer2 stale check | Read generation UNDER LOCK, compare with job.generation |
| Escalation event creation | Prisma upsert (getOrCreateActiveEscalationEvent) |
| Stale sweep | Prisma transaction (check no pending jobs + read generation + enqueue) |

## 5.4 What Must Be in Transactions

1. **State tool commit**: Order create/confirm/modify/cancel + conversation state update + memory update — all in one Prisma transaction
2. **Escalation creation**: getOrCreateActiveEscalationEvent + notification enqueue — in one transaction
3. **Stale sweep**: Check pending jobs + read generation + enqueue — in one transaction

## 5.5 What Must Be Idempotent

1. **Incoming messages**: Idempotency claim via processingState
2. **State tool execution**: Same tool with same args produces same result (createOrder is idempotent by orderId, confirmOrder checks status first)
3. **Layer2 execution**: Generation guard prevents stale execution
4. **Escalation creation**: getOrCreateActiveEscalationEvent reuses existing
5. **Notification enqueue**: Keyed by `conversationId:escalationEventId`

---

# 6. Error Handling

## 6.1 Failure Matrix

| Failure | Retry? | Times | Backoff | Safe? | Idempotent? | Recovery |
|---------|--------|-------|---------|-------|-------------|----------|
| PostgreSQL down | Yes (BullMQ) | 5 | Exponential 1s | Yes | Yes (claim check) | BullMQ retries |
| Prisma query error | Yes (BullMQ) | 5 | Exponential 1s | Yes | Yes (claim check) | BullMQ retries |
| Redis down (lock) | Fail pipeline | - | - | - | - | Release claim, BullMQ retry |
| Redis down (BullMQ) | BullMQ handles | - | - | - | - | BullMQ internal retry |
| LLM API 429 | Key rotation | 3 keys | Immediate | Yes | Yes (claim check) | Try next key, then fail |
| LLM API 500 | Yes (BullMQ) | 5 | Exponential 1s | Yes | Yes (claim check) | BullMQ retries |
| LLM malformed output | Fail job | - | - | - | Yes (claim check) | BullMQ retry re-runs LLM |
| Tool execution failure | No (within pipeline) | 1 | - | Yes | Yes | Tool returns error, pipeline continues |
| Shopify API failure | No (within tool) | 1 | - | Yes | Yes | Tool returns error, escalation |
| WhatsApp send failure | Yes (dedicated retry) | 3 | Exponential 2s | Yes | Yes (responseKey) | Dedicated retry queue |
| Network timeout | Yes (BullMQ) | 5 | Exponential 1s | Yes | Yes (claim check) | BullMQ retries |
| Lock acquisition timeout | Fail pipeline | 1 | - | Yes | Yes (claim check) | Release claim, BullMQ retry |
| Lock lease expiration | Heartbeat fails → TTL expires | - | - | - | - | Generation check catches stale work |
| Worker crash | BullMQ stalled job | 5 | Exponential 1s | Yes | Yes (claim check) | BullMQ stalled job detection |
| Process crash | All workers die | - | - | - | - | Restart process; BullMQ resumes pending jobs |
| Transaction failure | Rollback | - | - | Yes | - | State unchanged, BullMQ retries |
| Message send failure | Yes (responseKey dedup) | 3 | Exponential 2s | Yes | Yes | Retry with same responseKey |

## 6.2 Error Handling Principles

1. **Lock failure → release claim → retry via BullMQ**: Never hold a claim without a lock
2. **LLM failure → BullMQ retry**: The entire pipeline is re-executed (idempotent via claim)
3. **Tool failure → log + continue**: Individual tool failures don't crash the pipeline; error is included in response context
4. **WhatsApp failure → retry with responseKey**: Response is already persisted in DB; retry only the send
5. **Generation mismatch → ABORT silently**: Stale Layer2 job does nothing
6. **Never use retries as substitute for idempotency**: Every retry path assumes the operation may execute twice

---

# 7. Idempotency and Recovery

## 7.1 Protection Mechanisms

| Operation | Protection | Implementation |
|-----------|------------|----------------|
| Incoming message processing | `Message.processingState` atomic claim | Redis SET NX EX → Prisma update CLAIMED → process → COMPLETED |
| Main Pipeline execution | Conversation lock (serializes) | Lease-based lock ensures one pipeline per conversation |
| State tool execution | Database constraints + status checks | `createOrder` uses unique orderId; `confirmOrder` checks status=PENDING |
| Layer2 execution | `layer2Generation` guard | Re-read under lock, compare with job.generation |
| Escalation creation | `getOrCreateActiveEscalationEvent` | Upsert on conversationId with active event |
| Notification enqueue | `conversationId:escalationEventId` key | Dedup by key in outbox |
| Response send | `responseKey` dedup | Check if responseKey already sent before sending |
| Layer2 job creation | Deterministic jobId `layer2:{conversationId}:{generation}` | BullMQ dedup by jobId |
| Layer2 job cancellation | `cancelPendingLayer2Jobs` | Scan + remove (race-safe via generation check) |
| Merchant engagement | Lock + generation increment | Serializes with Layer2; generation invalidates stale jobs |

## 7.2 Recovery Mechanisms

| Scenario | Recovery |
|----------|----------|
| Worker crash mid-pipeline | BullMQ stalled job detection → retry with fresh processingState claim |
| Lock orphaned (holder crashed) | TTL expires → lock released → next acquirer proceeds |
| Layer2 job orphaned | Generation mismatch → abort on execution |
| Conversation stuck in takeover | Stale sweep job detects → enqueues fresh Layer2 |
| Message stuck in CLAIMED | Recovery sweep resets to PENDING after configurable timeout |
| Duplicate webhook delivery | Idempotency claim prevents double processing |

---

# 8. Queue and Worker Review

## 8.1 Existing Queues

### `message` queue — KEEP, MODIFY
- **Job name**: `process-message`
- **Payload**: `{ messageId: string }` — unchanged
- **Changes**: Add idempotency claim in worker before calling Orchestrator
- **Retry**: 5 attempts, exponential backoff 1s — unchanged
- **Concurrency**: 5 — unchanged

### `agent-layer2` queue — KEEP, MODIFY
- **Job name**: Dynamic kind
- **Payload**: `{ messageId: string, conversationId: string, generation: number }` — ADD generation field
- **Changes**: Worker must acquire lock, check generation, then process
- **Retry**: 3 attempts, exponential backoff 1s — unchanged
- **Delay**: 30s — unchanged
- **JobId**: `layer2:{conversationId}:{generation}` — ADD generation to prevent stale dedup

### `order-confirmation` queue — DEFER to V2
- Currently disabled (enqueueOrderJob commented out)
- Leave as dead code; reactivate in V2

### `email` queue — NO CHANGES

## 8.2 New Queue

### `recovery` queue — NEW (optional V1)
- **Purpose**: Periodic stale sweep for conversations stuck in takeover
- **Job name**: `stale-takeover-sweep`
- **Payload**: none (sweep finds candidates)
- **Delay**: Every 5 minutes (repeat job)
- **Retry**: 1 attempt (sweep is idempotent)

## 8.3 Worker Changes

| Worker | Current | Target |
|--------|---------|--------|
| `message.worker.ts` | `processMessage(messageId)` | Add: idempotency claim → `orchestrate(messageId)` → release claim |
| `layer2.worker.ts` | `processDeferredLayer2(messageId)` | Add: acquire lock → generation check → `processLayer2(messageId)` → release lock |
| `order.worker.ts` | Dead code | No changes |
| `email.worker.ts` | Email dispatch | No changes |

---

# 9. LLM Boundaries

## 9.1 LLM #1 (Intent Extraction)

**Responsibilities**:
- Parse customer message into structured intents
- Assign conversation act (NORMAL, AFFIRM, NEGATE, etc.)
- Assign confidence scores
- Propose suggested intents when no covered intent matches

**Must NOT**:
- Mutate any database state
- Control conversation state transitions
- Execute any tools
- Make business decisions (only classify)

**Validation and guards**:
- Zod schema validation on output (already exists: `INTENT_RESPONSE_SCHEMA`)
- Intent must be in allowed list or marked as suggested
- Confidence threshold (existing: 0.3 minimum)
- Conversation act is validated against enum

## 9.2 LLM #2 (Reply Generation)

**Responsibilities**:
- Generate natural language response in customer's language
- Incorporate tool results into response
- Maintain conversation tone (formal/friendly)
- Follow merchant catalog information

**Must NOT**:
- Mutate any database state
- Control state transitions
- Fabricate product information (prompt约束)
- Make business decisions

**Validation and guards**:
- Zod schema validation on output (existing: `REPLY_RESPONSE_SCHEMA`)
- Response is only sent if `suppressAutoReply` is false AND not `escalationShortCircuited`
- Response is persisted before send (durable)

## 9.3 LLM #3 (Product Matching — inside searchProducts tool)

**Responsibilities**:
- Match customer query against catalog products
- Classify if query is a reference or concrete name

**Must NOT**:
- Control state transitions
- Make order decisions

**Note**: This is an internal LLM call inside a tool, not a pipeline-level call.

## 9.4 Deterministic Business Rules (NOT delegated to LLM)

| Rule | Implementation |
|------|---------------|
| Intent → tool mapping | `INTENT_TOOL_MAP` (deterministic, already exists) |
| Tool → state transition | `TOOL_STATE_TRANSITIONS` (deterministic, already exists) |
| Escalation threshold | Count `recentIntents` entries (deterministic, already exists) |
| State guard on confirmOrder | Check `conversation.state === WAITING_CONFIRMATION` (deterministic, already exists) |
| Generation guard on Layer2 | Compare `job.generation === conversation.layer2Generation` (new) |
| suppressAutoReply check | Boolean check before generateResponse (new) |
| Dependency tracking | `dependsOnEntity(A)` → skip B if A failed (new) |
| UNKNOWN intent policy | Silent vs handoff decision (new) |

---

# 10. Flow/Business Logic Review

## 10.1 Main Pipeline (Customer Message)

**Input**: messageId
**Output**: Customer reply via WhatsApp (or silent)
**State requirements**: Conversation lock, layer2Generation, suppressAutoReply
**Memory**: conversation.memory JSON
**Tools used**: Intent-dependent (12 tools)
**Side effects**: Order mutations, WhatsApp sends, escalation creation
**Failure behavior**: BullMQ retry (entire pipeline re-executes idempotently)
**Idempotency**: Message processingState claim
**Tests needed**: Full pipeline integration test, concurrent messages, duplicate messages

## 10.2 Block A (Takeover Execution)

**Input**: messageId + conversation already taken over
**Output**: Write tool results persisted, Layer2 enqueued, NO response
**State requirements**: Lock inherited from Main Pipeline
**Memory**: Read from conversation.memory
**Tools used**: Write tools only (createOrder, confirmOrder, modifyOrder, cancelOrder, escalateConversation)
**Side effects**: Order mutations, Layer2 enqueue
**Failure behavior**: If write tool fails, record failure + apology in Layer2 response
**Idempotency**: Generation guard on Layer2
**Tests needed**: Takeover message processing, dependency tracking, UNKNOWN in takeover

## 10.3 Layer2 Execution

**Input**: messageId + conversationId + generation
**Output**: Customer reply via WhatsApp (or suppressed)
**State requirements**: Lock, generation check
**Memory**: conversation.memory (read), message.toolResults (read)
**Tools used**: Read tools only (searchProducts, recallPreviousProducts, chooseProduct, getProductDetails, suggestProducts, calculateShipping, getOrderStatus)
**Side effects**: WhatsApp send (only if suppressAutoReply=false and generation matches)
**Failure behavior**: Abort if stale, retry via BullMQ if transient
**Idempotency**: Generation guard + responseKey
**Tests needed**: Normal Layer2, stale Layer2 abort, suppressAutoReply path, de-escalation

## 10.4 Merchant Engagement

**Input**: merchant message
**Output**: Lock acquired, generation incremented, suppressAutoReply cleared, context merged
**State requirements**: Lock, generation
**Memory**: Merge merchant entities into conversation.memory
**Tools used**: None (lightweight entity extraction only, no LLM)
**Side effects**: Generation increment, suppressAutoReply clear, Layer2 cancel
**Failure behavior**: If lock fails, skip (merchant messages are best-effort)
**Idempotency**: Generation increment is idempotent (always increments)
**Tests needed**: Merchant during Layer2, merchant during AI processing, merchant during silent window

## 10.5 Stale Takeover Sweep

**Input**: periodic timer (every 5 minutes)
**Output**: Fresh Layer2 jobs for stale takeover conversations
**State requirements**: Atomic transaction (no lock needed)
**Memory**: None
**Tools used**: None
**Side effects**: Layer2 enqueue
**Failure behavior**: Skip candidate, try next
**Idempotency**: Deterministic jobId prevents duplicate jobs
**Tests needed**: Sweep finds stale, sweep skips active, sweep handles concurrent sweep

## 10.6 Unified UNKNOWN Handler

**Input**: UNKNOWN_INTENT + context
**Output**: Escalation created, policy decision (silent/handoff)
**State requirements**: Escalation event
**Memory**: Suggested intent recording
**Tools used**: None (analytics + escalation)
**Side effects**: Escalation, notification, suppressAutoReply (if silent)
**Failure behavior**: Log + continue (non-critical path)
**Idempotency**: getOrCreateActiveEscalationEvent
**Tests needed**: UNKNOWN in AI-owned, UNKNOWN in takeover, UNKNOWN with existing escalation

---

# 11. Testing Strategy

## 11.1 Test Infrastructure

- Use existing `node:test` + `node:assert/strict` (no new dependencies)
- Add test helper for Redis mocking (for lock and idempotency tests)
- Add test helper for Prisma mocking (for DB operation tests)

## 11.2 Test Priorities (in order)

### P0 — Must Have for V1

1. **Conversation lock** — acquire, release, contention, lease expiration, holder mismatch
2. **Idempotency claim** — claim, already claimed, already completed, release
3. **Layer2 generation guard** — matching generation, stale generation, concurrent increment
4. **FlowProcessor state commit** — state committed between intents, failed tool no state change
5. **suppressAutoReply** — set by UNKNOWN, cleared by merchant, checked by Layer2
6. **Merchant engagement** — lock, generation increment, suppressAutoReply clear, Layer2 cancel
7. **Main pipeline integration** — happy path, escalation threshold, UNKNOWN intent, takeover handoff
8. **Layer2 integration** — normal execution, stale abort, suppress path, de-escalation

### P1 — Should Have

9. **Unified UNKNOWN handler** — silent policy, handoff policy, existing escalation reuse
10. **Multi-intent dependency** — failed intent skips dependent, independent continues
11. **State tool commits** — createOrder commits before next intent, confirmOrder reads committed state
12. **WhatsApp send retry** — retry with responseKey, idempotent send
13. **Stale sweep** — finds stale, skips active, atomic transaction
14. **Concurrent messages** — two messages for same conversation serialized by lock

### P2 — Nice to Have

15. **Worker retry behavior** — BullMQ retry re-executes idempotently
16. **Lock heartbeat** — extends TTL, releases on crash
17. **Response dedup** — responseKey prevents duplicate sends

## 11.3 Existing Tests — What to Keep

All 6 existing test files are pure function tests and remain valid:
- `conversationState.test.ts` — extend with FlowProcessor integration
- `intents.test.ts` — extend with dependency field
- `layer2JobKind.test.ts` — unchanged
- `layer2Queue.test.ts` — unchanged
- `promptBuilder.test.ts` — extend with flow memory context
- `suggestionHelpers.test.ts` — unchanged

---

# 12. Observability

## 12.1 Structured Logger

**File**: `back/src/lib/logger.ts`

**Format**: JSON structured logs with consistent fields:
```
{
  "level": "info",
  "time": "2026-08-17T10:30:00Z",
  "msg": "Layer2 aborted: generation stale",
  "conversationId": "clx...",
  "messageId": "cmx...",
  "generation": 3,
  "jobGeneration": 2,
  "jobId": "layer2:clx...:2"
}
```

**Log levels**:
- `ERROR`: External failures, unhandled exceptions, data inconsistencies
- `WARN`: Retries, generation mismatches, lock contention, stale jobs
- `INFO`: Pipeline lifecycle events (see below)
- `DEBUG`: Tool execution details, prompt content, LLM responses

## 12.2 Required Log Events

| Event | Level | Key Fields |
|-------|-------|------------|
| message.received | INFO | messageId, conversationId, merchantId |
| message.claimed | INFO | messageId, claimed (boolean) |
| message.already_processed | INFO | messageId |
| pipeline.started | INFO | messageId, conversationId |
| pipeline.completed | INFO | messageId, conversationId, duration |
| intents.extracted | INFO | messageId, intentCount, intents |
| lock.acquired | DEBUG | conversationId, holder, leaseMs |
| lock.released | DEBUG | conversationId, holder, duration |
| lock.contention | WARN | conversationId, waitMs |
| lock.lease_expired | WARN | conversationId, holder |
| layer2.scheduled | INFO | conversationId, generation, jobId |
| layer2.started | INFO | messageId, generation |
| layer2.aborted_stale | WARN | messageId, jobGeneration, currentGeneration |
| layer2.completed | INFO | messageId, duration |
| escalation.created | INFO | conversationId, escalationEventId, reason |
| escalation.threshold | INFO | conversationId, count, threshold |
| escalation.unknown | INFO | conversationId, intent |
| merchant.engagement | INFO | conversationId, generation |
| merchant.context_merged | DEBUG | conversationId, entities |
| tool.executed | DEBUG | messageId, toolName, success, duration |
| tool.failed | WARN | messageId, toolName, error |
| response.generated | INFO | messageId, conversationId |
| response.sent | INFO | messageId, conversationId, responseKey |
| response.send_failed | WARN | messageId, error |
| response.suppressed | INFO | messageId, reason |
| state.transition | DEBUG | conversationId, from, to, tool |
| memory.updated | DEBUG | conversationId, fields |
| sweep.found_stale | INFO | conversationId |
| sweep.enqueued | INFO | conversationId, generation |

## 12.3 What NOT to Log

- Customer phone numbers (PII)
- Customer message content (privacy)
- LLM API keys
- Database passwords
- Full LLM prompts (log summary only)
- Full LLM responses (log intent summary only)

---

# 13. Seven-Day Implementation Plan

## Day 1 (12h): Foundation — Lock, Idempotency, Logger, Schema

### Objective
Establish the infrastructure layer that all subsequent work depends on.

### Tasks

**Hour 1-3: Structured Logger**
- Create `back/src/lib/logger.ts`
- Implement JSON structured logger with conversationId/messageId/generation fields
- Replace all `console.log`/`console.error` in `agent.service.ts`, `executeTools.ts`, `generateResponse.ts`, `escalation.ts`, `message.worker.ts`, `layer2.worker.ts`
- Log level configurable via `LOG_LEVEL` env var

**Hour 4-6: Conversation Lock**
- Create `back/src/lib/conversationLock.ts`
- Implement Redis lease-based lock with:
  - `acquireLock(conversationId, holder, leaseMs=30000)` → `{ lockId, release }`
  - `releaseLock(conversationId, lockId)` via Lua script
  - Heartbeat extension (setInterval every 10s)
- Create `back/src/modules/ai/__tests__/conversationLock.test.ts`:
  - Acquire and release
  - Contention (second acquirer blocks)
  - Lease expiration
  - Holder mismatch on release
  - Heartbeat extension

**Hour 7-9: Idempotency Claim**
- Create `back/src/lib/idempotency.ts`
- Implement `claimMessageProcessing(messageId)`:
  - Redis SET NX EX with 5-minute TTL
  - Returns `{ claimed: boolean }`
- Implement `completeProcessing(messageId)`:
  - Set processingState=COMPLETED in DB
  - Remove Redis key
- Create `back/src/modules/ai/__tests__/idempotency.test.ts`:
  - Claim success
  - Claim already claimed
  - Claim already completed
  - TTL expiration

**Hour 10-12: Schema Migration**
- Add to `schema.prisma`:
  - `layer2Generation` Int @default(0) on Conversation
  - `suppressAutoReply` Boolean @default(false) on Conversation
  - `escalationEventId` String? on Conversation
  - `processingState` enum + field on Message
  - `responseKey` String? on Message
- Run `pnpm --filter back db:push`
- Update `shared/src/types/index.ts` to include new fields
- Run `pnpm --filter back db:generate`

### Validation
- `pnpm build` passes
- `pnpm --filter back test` passes (existing tests)
- Lock tests pass
- Idempotency tests pass

### Definition of Done
- Logger is used in all AI pipeline files
- Lock can be acquired and released with heartbeat
- Idempotency claim prevents duplicate processing
- Schema is migrated with all new fields
- All existing tests pass

---

## Day 2 (12h): Orchestrator Refactor + FlowResolver + FlowProcessor

### Objective
Refactor the main pipeline to use lock, idempotency, and new flow execution model.

### Tasks

**Hour 1-4: Orchestrator Refactor**
- Refactor `agent.service.ts` → rename to `orchestrator.ts`
- New `orchestrate(messageId)` function:
  1. Load message + conversation
  2. Idempotency claim (via `claimMessageProcessing`)
  3. Save message (if not already saved)
  4. Extract intents (LLM #1)
  5. Save parsedIntents to message
  6. Acquire conversation lock
  7. try:
     - Append to recentIntents
     - Escalation threshold check
     - If threshold reached → escalateShortCircuit → STOP
     - If takenOverByHuman → Block A (inheriting lock)
     - Else → AI-owned path
     - Final response (if AI-owned, not suppressed)
     - Persist processing result
  8. finally: release lock + complete claim

**Hour 5-7: FlowResolver**
- Create `back/src/modules/ai/flowResolver.ts`
- `resolveFlow(intent, context) → FlowProcessor`
- Maps intent categories to processors:
  - UNKNOWN → UnifiedUnknownProcessor
  - STATE (order lifecycle) → StateToolProcessor
  - QUERY → QueryToolProcessor
  - SOCIAL/FAQ → SocialProcessor (generates response without tool)
- Pure routing, no execution

**Hour 8-10: FlowProcessor**
- Create `back/src/modules/ai/flowProcessor.ts`
- `processIntent(intent, context) → IntentResult`
- Handles:
  - Dependency check (skip if dependsOnEntity and prior failed)
  - Tool resolution (via existing `resolveTool`)
  - Tool execution
  - State commit (if state tool): Prisma transaction
  - Result recording
- State commit transaction:
  1. Execute tool (DB mutations)
  2. Update conversation.state
  3. Update conversation.memory (flow memory)
  4. All in one Prisma transaction

**Hour 11-12: Tests**
- `orchestrator.test.ts` — happy path, idempotency, lock acquisition
- `flowResolver.test.ts` — intent routing to correct processor
- `flowProcessor.test.ts` — state commit, dependency skip, tool failure handling

### Validation
- `pnpm build` passes
- `pnpm --filter back test` passes (all tests including new)
- Orchestrator uses lock + idempotency
- FlowProcessor commits state between intents

### Definition of Done
- Orchestrator is refactored with lock + idempotency
- FlowResolver routes intents to correct processors
- FlowProcessor executes tools with state commits
- All existing tests pass
- New tests pass

---

## Day 3 (12h): Tool Extraction + State Tools + Query Tools

### Objective
Split the god file, implement proper tool boundaries with FlowProcessor integration.

### Tasks

**Hour 1-4: Extract Tool Handlers from registry.ts**
- Split `tools/registry.ts` (933 lines) into separate files:
  - `tools/searchProducts.ts`
  - `tools/recallPreviousProducts.ts`
  - `tools/chooseProduct.ts`
  - `tools/getProductDetails.ts`
  - `tools/suggestProducts.ts`
  - `tools/calculateShipping.ts`
  - `tools/getOrderStatus.ts`
  - `tools/createOrder.ts`
  - `tools/confirmOrder.ts`
  - `tools/modifyOrder.ts`
  - `tools/cancelOrder.ts`
  - `tools/escalateConversation.ts`
  - `tools/index.ts` (barrel export + registry)
- Each tool: standalone function, receives context, returns result, does NOT update conversation.state
- Move state updates OUT of tools into FlowProcessor

**Hour 5-8: State Tool Processor**
- Create `back/src/modules/ai/processors/stateToolProcessor.ts`
- Handles ORDER_CREATE, ORDER_CONFIRM, ORDER_MODIFY, ORDER_CANCEL
- Before execution: check state guards (e.g., confirmOrder requires WAITING_CONFIRMATION)
- After execution: commit state in Prisma transaction
- On failure: record failure, don't advance state
- On success: update flow.memory with committed state

**Hour 9-10: Query Tool Processor**
- Create `back/src/modules/ai/processors/queryToolProcessor.ts`
- Handles PRODUCT_SEARCH, PRODUCT_SELECT, PRODUCT_DETAILS, PRODUCT_SUGGEST, SHIPPING_CHECK, STATUS_CHECK
- No state mutation
- Returns results for response generation

**Hour 11-12: Tests**
- `stateToolProcessor.test.ts` — state guard, commit, failure
- `queryToolProcessor.test.ts` — happy path, no state change
- Individual tool tests — at least createOrder and confirmOrder

### Validation
- `pnpm build` passes
- `pnpm --filter back test` passes
- `tools/registry.ts` is eliminated or reduced to <100 lines (registry only)
- State tools commit via FlowProcessor, not directly

### Definition of Done
- registry.ts is split into individual tool files
- State tools use FlowProcessor for state commits
- Query tools return results without state mutation
- All tests pass

---

## Day 4 (12h): Unified UNKNOWN + Escalation Events + Layer2 Refactor

### Objective
Implement the critical escalation and Layer2 changes.

### Tasks

**Hour 1-3: Unified UNKNOWN Handler**
- Create `back/src/modules/ai/processors/unknownHandler.ts`
- Handles UNKNOWN_INTENT in both AI-owned and takeover paths
- Flow:
  1. Record suggested intent (analytics)
  2. getOrCreateActiveEscalationEvent
  3. Escalate("UNCLASSIFIED")
  4. Enqueue notification (keyed by conversationId:escalationEventId)
  5. Policy decision: silent → suppressAutoReply=true, takenOverByHuman=true; handoff → append handoff reply
  6. STOP remaining intents
- Tests: UNKNOWN in AI-owned, UNKNOWN in takeover, UNKNOWN with existing escalation

**Hour 4-6: Durable Escalation Events**
- Create `back/src/modules/ai/escalationEvent.ts`
- `getOrCreateActiveEscalationEvent(conversationId) → escalationEventId`
  - Check if conversation has active escalationEventId
  - If yes, reuse
  - If no, create new UUID, save to conversation.escalationEventId
- `deescalate(conversationId)`:
  - Clear conversation.escalationEventId
  - Set takenOverByHuman=false, escalatedAt=null
- Refactor `escalation.ts` to use escalationEvent
- Notification keyed by `conversationId:escalationEventId`
- Tests: create, reuse, deescalate, concurrent creation

**Hour 7-10: Layer2 Refactor**
- Refactor `processDeferredLayer2` in orchestrator:
  1. Acquire conversation lock
  2. Re-read `layer2Generation` UNDER LOCK
  3. Compare with job.generation → ABORT if stale
  4. Read `suppressAutoReply` UNDER LOCK
  5. Collect deferred intents from message.parsedIntents
  6. If suppressAutoReply=true:
     - Execute pending query tools
     - Re-check generation
     - Persist results
     - Stamp layer2ConsumedAt
     - NO generateResponse
     - Return
  7. Else:
     - Execute pending query tools
     - Re-check generation
     - Merge results
     - FINAL generation check
     - generateResponse under durable responseKey
     - Record response as sent
     - Stamp layer2ConsumedAt
     - THEN de-escalate
- Update `layer2.worker.ts` to acquire lock before calling processor
- Add `generation` to Layer2 job payload
- Update jobId to `layer2:{conversationId}:{generation}`
- Tests: stale abort, suppress path, normal execution, de-escalation timing

**Hour 11-12: Tests**
- `unknownHandler.test.ts`
- `escalationEvent.test.ts`
- `layer2Processor.test.ts` — stale, suppress, normal

### Validation
- `pnpm build` passes
- `pnpm --filter back test` passes
- Layer2 aborts on stale generation
- suppressAutoReply prevents response
- Escalation events are durable

### Definition of Done
- Unified UNKNOWN handler works in both paths
- Escalation events are durable with escalationEventId
- Layer2 checks generation under lock
- Layer2 respects suppressAutoReply
- All tests pass

---

## Day 5 (12h): Merchant Engagement + Block A + Multi-Intent Dependencies

### Objective
Complete the remaining pipeline branches and intent handling.

### Tasks

**Hour 1-4: Merchant Engagement Flow**
- Create `back/src/modules/ai/merchantEngagement.ts`
- `processMerchantMessage(conversationId, messageText)`:
  1. Acquire conversation lock
  2. try:
     - Increment layer2Generation (atomic SQL)
     - Cancel pending Layer2 jobs
     - closePreviousSilentWindow:
       - suppressAutoReply = false
       - Mark previous silent/deferred messages consumed
     - ExtractMerchantContext:
       - Lightweight entity extraction (regex/NLP, NO LLM)
       - Extract: order references, product mentions, status updates
     - mergeIntoFlowMemory:
       - Merge merchant entities into conversation.memory
     - Persist
  3. finally: release lock
- Refactor `whatsapp.controller.ts` message.sent handler to call this
- Tests: merchant during Layer2, merchant during AI, merchant during silent window

**Hour 5-7: Block A (Takeover Execution)**
- Implement Block A in orchestrator:
  - Lock already held by Main Pipeline
  - Layer1 + threshold + recentIntents already done
  - For EACH intent:
    - Dependency check (skip if prior failed)
    - UNKNOWN → UnifiedUnknownHandler → STOP
    - explicit escalateConversation → escalate + continue/STOP per policy
    - State Tool → execute + commit (or fail)
    - Query Tool → SKIP (defer to Layer2)
  - Persist results
  - Cancel pending Layer2 jobs
  - Increment layer2Generation
  - Decide Layer2 job kind
  - Enqueue Layer2 job
  - NO generateResponse
- Tests: Block A happy path, dependency skip, UNKNOWN in Block A, query skip

**Hour 8-10: Multi-Intent Dependencies**
- Add `dependsOnEntity` field to intent schema
- In FlowProcessor:
  - Track which intents succeeded/failed
  - For each subsequent intent, check dependsOnEntity
  - If depends on a failed prior intent → SKIP + record
  - Independent intents continue after failures
- Update `sortIntents` to respect dependency order
- Tests: dependent skip, independent continues, mixed

**Hour 11-12: Tests**
- `merchantEngagement.test.ts`
- Block A integration tests
- Multi-intent dependency tests

### Validation
- `pnpm build` passes
- `pnpm --filter back test` passes
- Merchant messages properly increment generation
- Block A inherits lock correctly
- Dependencies are tracked

### Definition of Done
- Merchant engagement acquires lock and increments generation
- Block A inherits lock and executes write tools only
- Multi-intent dependencies are tracked and enforced
- All tests pass

---

## Day 6 (12h): Stale Sweep + Response Dedup + Error Hardening

### Objective
Add recovery mechanisms, harden error paths, add response dedup.

### Tasks

**Hour 1-3: Stale Takeover Sweep**
- Create `back/src/modules/ai/staleTakeoverSweep.ts`
- `runStaleTakeoverSweep()`:
  1. Find candidates: conversations where takenOverByHuman=true AND escalatedAt < now - 10 minutes AND no pending Layer2 jobs
  2. For each candidate (in atomic transaction):
     - Re-check no pending Layer2Job
     - Re-read layer2Generation
     - Decide Layer2 job kind
     - Enqueue Layer2 job with fresh generation
- Create `queues/recovery.queue.ts`:
  - Repeat job every 5 minutes
  - Calls `runStaleTakeoverSweep`
- Worker: `workers/recovery.worker.ts`
- Tests: finds stale, skips active, atomic transaction, concurrent sweep

**Hour 4-6: Response Dedup (responseKey)**
- Implement responseKey generation:
  - Key = `conv:{conversationId}:msg:{messageId}:gen:{generation}`
  - Check Redis SET NX before sending
  - If already sent → skip WhatsApp send
  - If new → send and set key with 1-hour TTL
- Integrate into `generateResponse.ts`
- Add to WhatsApp send path
- Tests: duplicate send prevented, different messages allowed

**Hour 7-9: Error Hardening**
- WhatsApp send retry:
  - Create `lib/whatsappRetry.ts`
  - Retry 3 times with exponential backoff (2s, 4s, 8s)
  - Use responseKey for dedup
  - Log each attempt
- Lock heartbeat failure handling:
  - If heartbeat fails 3 consecutive times, release lock gracefully
  - Log warning
- LLM API key rotation:
  - Ensure rotation is thread-safe (use atomic increment)
  - Add try/catch around each key attempt
- Worker graceful shutdown:
  - Add SIGTERM handler to all workers
  - Wait for in-flight jobs to complete
  - Close Redis connection

**Hour 10-12: Tests**
- `staleTakeoverSweep.test.ts`
- `responseDedup.test.ts`
- `whatsappRetry.test.ts`
- Error path tests

### Validation
- `pnpm build` passes
- `pnpm --filter back test` passes
- Stale sweep recovers stuck conversations
- Response dedup prevents duplicate sends
- Error paths are tested

### Definition of Done
- Stale sweep runs periodically and recovers stuck conversations
- Response dedup prevents duplicate WhatsApp sends
- WhatsApp send retries on failure
- Workers handle graceful shutdown
- All tests pass

---

## Day 7 (12h): Integration Testing, Concurrency Testing, Stabilization

### Objective
End-to-end validation, concurrency testing, bug fixes, documentation.

### Tasks

**Hour 1-3: Integration Tests**
- Full pipeline integration test:
  - Mock LLM, WhatsApp, Prisma
  - Test complete flow: message → intents → tools → response
  - Test takeover flow: message → escalation → Block A → Layer2
  - Test merchant engagement: merchant message → generation increment
- Layer2 integration test:
  - Normal execution
  - Stale abort
  - Suppress path

**Hour 4-6: Concurrency Tests**
- Two messages for same conversation:
  - Second message blocks on lock
  - Both complete in order
  - Memory is consistent
- Merchant message during Layer2:
  - Merchant acquires lock after Layer2 releases
  - Generation incremented
  - Layer2's stale generation check catches it
- Duplicate message delivery:
  - Idempotency claim prevents double processing
  - Only one reply sent
- Worker crash during lock:
  - Lock TTL expires
  - Next worker acquires lock
  - Generation check prevents stale work

**Hour 7-9: Stabilization**
- Run full test suite: `pnpm --filter back test`
- Run typecheck: `pnpm build`
- Run lint: `pnpm lint`
- Fix any failing tests
- Fix any type errors
- Review all console.log replacements (ensure none remain)
- Review all TODO comments

**Hour 10-11: Documentation**
- Update README.md with new architecture notes
- Create `back/src/modules/ai/README.md` documenting:
  - Pipeline flow
  - Lock protocol
  - Idempotency mechanism
  - Layer2 generation guard
  - How to add a new tool
  - How to debug production issues
- Update AGENTS.md with any changes

**Hour 12: Final Validation**
- Full build: `pnpm build`
- Full test: `pnpm --filter back test`
- Full lint: `pnpm lint`
- Manual review of all critical paths
- Commit all changes

### Validation
- All tests pass (existing + new)
- Build succeeds
- No console.log remaining
- Documentation is complete

### Definition of Done
- Integration tests cover happy paths
- Concurrency tests cover critical races
- All tests pass
- Build/typecheck/lint pass
- Documentation is complete
- No known P0/P1 bugs

---

# 14. Risk Management

## 14.1 Highest Risks

### Risk 1: Conversation Lock Deadlock
- **Why**: Lock acquisition failure or lease expiration during active processing
- **Probability**: Low (lease TTL + heartbeat)
- **Impact**: High (conversation stuck until TTL expires)
- **Test**: Kill worker during lock hold, verify TTL releases
- **Mitigation**: 30s lease + 10s heartbeat; lock holder checks its own lock before critical sections
- **Fallback**: TTL expiration is the ultimate fallback

### Risk 2: Layer2 Generation Race
- **Why**: Generation increment and Layer2 enqueue must be atomic
- **Probability**: Medium (concurrent messages)
- **Impact**: High (stale Layer2 executes with old state)
- **Test**: Concurrent messages with generation tracking
- **Mitigation**: Generation increment happens under lock, before enqueue; Layer2 re-reads generation under lock
- **Fallback**: Layer2 always checks generation before side effects

### Risk 3: State Commit Transaction Failure
- **Why**: Prisma transaction fails mid-commit (DB crash, constraint violation)
- **Probability**: Low
- **Impact**: Medium (partial state update)
- **Test**: Mock DB failure during transaction
- **Mitigation**: Transaction rollback leaves state unchanged; BullMQ retries re-execute
- **Fallback**: Retry via BullMQ

### Risk 4: WhatsApp Send Failure After Response Generation
- **Why**: WhatsApp API is down or rate-limited
- **Probability**: Medium
- **Impact**: Medium (customer doesn't see reply, but response is persisted)
- **Test**: Mock WhatsApp failure
- **Mitigation**: Response persisted in DB before send; retry with responseKey dedup
- **Fallback**: Customer can be re-engaged via follow-up

### Risk 5: Existing Behavior Regression
- **Why**: Refactoring may break existing working flows
- **Probability**: Medium
- **Impact**: High (production breakage)
- **Test**: Run all existing tests, add integration tests
- **Mitigation**: Incremental refactoring with tests at each step; keep existing tests passing
- **Fallback**: Git revert to last working commit

### Risk 6: Lock Performance Under High Load
- **Why**: Redis lock adds latency to every message processing
- **Probability**: Low (Redis is fast)
- **Impact**: Low (adds ~1-2ms per message)
- **Test**: Load test with concurrent messages
- **Mitigation**: Lock is Redis-native (SET NX EX), minimal overhead
- **Fallback**: Increase worker concurrency

---

# 15. What NOT to Do in V1

| Feature | Why Deferred |
|---------|-------------|
| Follow-up scheduling (T+2h, T+24h, T+48h) | Existing fields exist but no scheduler; defer to V2 |
| Order confirmation queue (email/notification) | Currently disabled; reactivate in V2 |
| Voice message processing in webhook (async) | Currently synchronous; optimize in V2 |
| Product image recognition pipeline | Currently works; optimize in V2 |
| Delivery provider integration (Yalidine/Procolis) | Existing tools work; no changes needed for V1 |
| Dashboard real-time updates (WebSocket/SSE) | Existing SSE works; enhance in V2 |
| Multi-merchant scaling | Single-process architecture; scale in V2 |
| Rate limiting on LLM calls | Add in V2 |
| Prompt injection protection | Add in V2 |
| Customer blacklisting | PRD says out of scope for MVP |
| Pack/bundle promotions | PRD says out of scope for MVP |
| Agent voice replies | PRD says out of scope for MVP |
| Mobile app | PRD says out of scope for MVP |
| Public API | PRD says out of scope for MVP |

---

# 16. Final Definition of Done

## Architecture
- [ ] Conversation lock (lease-based) implemented and tested
- [ ] Idempotency claim on messageId implemented and tested
- [ ] layer2Generation field added and used for stale-job guard
- [ ] suppressAutoReply field added and used for response suppression
- [ ] FlowResolver routes intents to correct processors
- [ ] FlowProcessor executes tools with state commits between intents
- [ ] Unified UNKNOWN handler works in both AI-owned and takeover paths
- [ ] Merchant engagement acquires lock, increments generation, clears suppressAutoReply
- [ ] Block A inherits lock, executes write tools only, enqueues Layer2
- [ ] Layer2 checks generation under lock before side effects
- [ ] Multi-intent dependency tracking implemented
- [ ] Durable escalation events with escalationEventId
- [ ] Stale takeover sweep recovers stuck conversations
- [ ] Response dedup via responseKey

## Correctness
- [ ] Concurrent messages for same conversation are serialized by lock
- [ ] Duplicate message processing is prevented by idempotency claim
- [ ] Stale Layer2 jobs abort via generation guard
- [ ] suppressAutoReply prevents response generation
- [ ] State tools commit in transactions
- [ ] Dependencies are tracked and enforced

## Error Handling
- [ ] Lock failure → release claim → BullMQ retry
- [ ] LLM failure → key rotation → BullMQ retry
- [ ] WhatsApp failure → retry with responseKey
- [ ] Tool failure → log + continue pipeline
- [ ] Worker crash → BullMQ stalled job detection
- [ ] Lock orphan → TTL expiration

## Testing
- [ ] All existing 6 test files pass
- [ ] Lock tests (acquire, release, contention, expiration)
- [ ] Idempotency tests (claim, already claimed, TTL)
- [ ] Generation guard tests (matching, stale, concurrent)
- [ ] FlowProcessor tests (state commit, dependency skip)
- [ ] UNKNOWN handler tests (both paths)
- [ ] Merchant engagement tests
- [ ] Layer2 integration tests
- [ ] Stale sweep tests
- [ ] Concurrency tests (2 messages, merchant during Layer2, duplicate delivery)

## Build
- [ ] `pnpm build` passes
- [ ] `pnpm --filter back test` passes
- [ ] `pnpm lint` passes
- [ ] No TypeScript errors

## Observability
- [ ] Structured logger implemented
- [ ] All console.log replaced
- [ ] All critical events logged with identifiers
- [ ] No PII logged

## Documentation
- [ ] AI module README.md
- [ ] Updated main README.md
- [ ] Updated AGENTS.md
