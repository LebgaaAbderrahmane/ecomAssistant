# Conversation Orchestration Flow — v11 (Hardened)

## Merchant Message Handling

```text
merchant message
  │
  ▼
message.sent hook
  │
  ├── acquireConversationLock (lease)
  │
  ├── try
  │     ├── increment layer2Generation
  │     ├── cancelPendingLayer2Jobs
  │     ├── closePreviousSilentWindow
  │     │     ├── suppressAutoReply = false
  │     │     └── mark previous silent/deferred messages consumed
  │     ├── ExtractMerchantContext
  │     │     ├── lightweight entity extraction only
  │     │     ├── NO IntentResolver
  │     │     ├── NO State Tools
  │     │     ├── NO Query Tools
  │     │     ├── NO Escalate
  │     │     └── NO generateResponse
  │     ├── mergeIntoFlowMemory
  │     └── persist
  │
  └── finally
        releaseConversationLock
```

---

## Main Pipeline (Customer Message)

```text
user message
  │
  ▼
QueueMessage(messageId)
  │
  ▼
Orchestrator(messageId)
  │
  ├── IDEMPOTENCY CLAIM
  │     already claimed/completed? → STOP
  │     else → atomic claim
  │
  ├── saveMessage
  │
  ├── ExtractIntents                    // always
  │
  ├── saveIntents
  │
  ├── acquireConversationLock (lease)
  │     failure → release claim → retry/DLQ
  │
  ├── try
  │     │
  │     ├── appendToRecentIntents       // always
  │     │
  │     ├── EscalationThresholdCheck
  │     │     threshold reached?
  │     │       ├── getOrCreateActiveEscalationEvent
  │     │       ├── Escalate("FRUSTRATION_THRESHOLD")
  │     │       ├── enqueueNotification(notificationKey)
  │     │       ├── escalationShortCircuited = true
  │     │       └── STOP (no tools, no response)
  │     │
  │     ├── escalationShortCircuited? → finally release → STOP
  │     │
  │     ├── takenOverByHuman?
  │     │     YES → TAKEOVER_EXECUTION (Block A)   // inherits lock
  │     │
  │     └── NO (AI-owned)
  │           │
  │           ├── splitIntents
  │           ├── empty? → persist no-op → release → STOP
  │           │
  │           └── for EACH intent (extraction order)
  │                 ├── dependency on FAILED prior? → SKIP + record
  │                 ├── UNKNOWN_INTENT?
  │                 │     └── UNIFIED_UNKNOWN_HANDLER
  │                 │           ├── handleSuggestedIntents (analytics)
  │                 │           ├── getOrCreateActiveEscalationEvent
  │                 │           ├── Escalate("UNCLASSIFIED")
  │                 │           ├── enqueueNotification
  │                 │           ├── policy
  │                 │           │     silent → suppressAutoReply=true
  │                 │           │             takenOverByHuman=true
  │                 │           │             escalatedAt=now
  │                 │           │     handoff → append handoff reply
  │                 │           └── STOP remaining intents
  │                 │
  │                 └── STATE / QUERY / SOCIAL / FAQ
  │                       └── FlowResolver → FlowProcessor
  │                             State Tools commit before next intent
  │
  │     ├── Final Response (AI-owned only)
  │     │     ├── escalationShortCircuited or suppressAutoReply?
  │     │     │     → discard responseUnits
  │     │     └── else
  │     │           ├── generateResponse
  │     │           ├── send under durable responseKey
  │     │           └── record response as sent
  │     │
  │     └── persist processing result
  │
  └── finally
        releaseConversationLock
```

---

## FlowProcessor

```text
FlowProcessor
  │
  ├── QUERY_INTENT → Query Tool
  │
  │
  └── STATE_INTENT (order lifecycle)
        ├── ineligible state? → INVALID_ACTION
        ├── guard fail / missing fields? → ask for fields
        └── ready
              ├── execute State Tool
              ├── FAILED → persist failure + mark FAILED + apology
              └── SUCCESS → COMMIT to flow.memory + update state
                    then next intent
```

---

## Block A — Takeover Execution (inherits lock)

```text
// lock already held by Main Pipeline
// Layer1 + threshold + recentIntents already done

for EACH intent
  ├── dependency on FAILED prior? → SKIP
  ├── UNKNOWN_INTENT? → UNIFIED_UNKNOWN_HANDLER → STOP
  ├── explicit escalateConversation?
  │     ├── getOrCreateActiveEscalationEvent
  │     ├── already escalated? → state write NO-OP
  │     ├── else → takenOverByHuman=true, escalatedAt=now
  │     ├── enqueueNotification
  │     └── continue/STOP per policy
  ├── State Tool? → execute + COMMIT (or FAIL)
  └── Query Tool? → SKIP (defer)

persist results
cancelPendingLayer2Jobs
increment layer2Generation
decideLayer2JobKind
enqueue Layer2Job(jobId = layer2:{conversationId}:{generation}, generation)
// NO generateResponse
// Main Pipeline releases lock in finally
```

---

## Layer2 Execution

```text
Layer2Job fires
  │
  ▼
processDeferredLayer2
  │
  ├── acquireConversationLock (lease)
  │
  ├── try
  │     ├── re-read layer2Generation UNDER LOCK
  │     ├── job.generation ≠ current → ABORT (no side effects)
  │     │
  │     ├── read suppressAutoReply UNDER LOCK
  │     ├── collectDeferredIntents
  │     │
  │     ├── suppressAutoReply == true?
  │     │     ├── execute pending Query Tools
  │     │     ├── RE-CHECK generation
  │     │     ├── persist Query results (idempotent)
  │     │     ├── stamp layer2ConsumedAt
  │     │     ├── KEEP takenOverByHuman + escalatedAt
  │     │     ├── NO generateResponse
  │     │     └── return
  │     │
  │     └── else
  │           ├── execute pending Query Tools if needed
  │           ├── RE-CHECK generation
  │           ├── merge results
  │           ├── FINAL generation check
  │           ├── generateResponse under durable responseKey
  │           ├── record response as sent
  │           ├── stamp layer2ConsumedAt
  │           ├── THEN de-escalate
  │           │     takenOverByHuman = false
  │           │     escalatedAt = null
  │           └── return
  │
  └── finally
        releaseConversationLock
```

---

## Stale-Takeover Sweep

```text
StaleTakeoverSweep
  │
  ├── find candidates (advisory)
  │
  └── for each candidate
        ATOMIC transaction
          ├── re-check no pending Layer2Job
          ├── re-read layer2Generation
          ├── decideLayer2JobKind
          └── enqueue Layer2Job with fresh generation
                jobId = layer2:{conversationId}:{freshGeneration}
```

---

## Unified UNKNOWN Handler

(Used by both AI-owned path and Block A)

```text
UNIFIED_UNKNOWN_HANDLER
  ├── handleSuggestedIntents (analytics always)
  ├── getOrCreateActiveEscalationEvent
  ├── Escalate("UNCLASSIFIED")
  ├── enqueueNotification(notificationKey)
  ├── policy
  │     silent → suppressAutoReply=true
  │             takenOverByHuman=true
  │             escalatedAt=now
  │     handoff → append standard handoff reply
  └── STOP remaining intents
```

---

## Canonical Escalation + Notification

```text
getOrCreateActiveEscalationEvent
  ├── active exists? → reuse
  └── else → create

notificationKey = conversationId + ":" + escalationEventId

enqueueNotification → durable outbox (idempotent)
```

---

## Final Response (AI-Owned Path)

```text
after all intents
  │
  ├── escalationShortCircuited or suppressAutoReply?
  │     → discard responseUnits
  │
  └── otherwise
        ├── generateResponse
        ├── send under durable responseKey
        └── record response as sent
```

---

## Silent Policy Lifecycle

```text
UNKNOWN_INTENT (silent policy)
  │
  ▼
suppressAutoReply = true
takenOverByHuman = true
escalatedAt = now
  │
  ├── no merchant message
  │     └── Layer2 runs
  │           ├── Query Tools may execute
  │           ├── messages consumed
  │           ├── NO generateResponse
  │           └── stays human-owned
  │
  └── merchant message
        ├── cancel Layer2
        ├── generation++
        ├── close previous silent window
        ├── suppressAutoReply = false
        └── future customer messages start normal AI window
```

---

## Merchant Reply Race

```text
Layer2 running
  │
  ├── merchant sends message
  │     └── acquire SAME conversation lock (lease)
  │
  ├── merchant engagement
  │     ├── increment layer2Generation
  │     ├── cancel pending Layer2 jobs
  │     ├── clear suppressAutoReply
  │     ├── close/consume previous silent window
  │     └── merge merchant context
  │
  ├── release lock
  │
  └── Layer2
        ├── if it has not acquired the lock yet → reads NEW generation → ABORT
        └── if it already owns the lock → merchant waits until Layer2 releases
              then merchant increments generation before any subsequent irreversible work
```

---

## Locking Contract

```text
Conversation Processing Lock (lease-based)
  │
  ├── Merchant engagement
  ├── Main Pipeline (AI-owned or Block A)
  └── Layer2

Block A never acquires the lock (inherits from Main Pipeline).
Every acquire has a matching finally release.
Lease + heartbeat + reaper prevent permanent locks.
```

---

## Multi-Intent Guarantees

```text
Independent intents
  Intent A FAILED
  Intent B independent
  Intent C independent
  → A FAILED, B EXECUTE, C EXECUTE

Dependent intents
  Intent A FAILED
  Intent B dependsOnEntity(A)
  Intent C independent
  → A FAILED, B SKIPPED, C EXECUTE

Sequential state/query
  cancelOrder
      ↓ COMMIT
  getOrderStatus
  → Query reads committed state

State chain
  modifyOrder
      ↓ COMMIT
  confirmOrder
      ↓ COMMIT
  → never parallelized within the same message
```

---

## v11 Invariants (enforced by the trees)

1. LLM #1 always extracts intents.
2. recentIntents is updated for every customer message, including takeover.
3. Escalation threshold checking is unconditional.
4. Threshold escalation short-circuits the current customer message (no State Tool, no Query Tool, no response).
5. Merchant messages never execute customer State/Query Tools or customer responses.
6. State Tools execute sequentially; commit completes before the next intent.
7. Dependent intents are skipped only when their referenced prior intent failed.
8. Independent intents continue after failures.
9. UNKNOWN_INTENT uses the same UNIFIED_UNKNOWN_HANDLER in AI-owned and takeover modes and stops remaining intents.
10. layer2Generation is the authoritative stale-job guard and is re-read under the lock before side effects.
11. A superseded Layer2 job performs no further side effects.
12. The same lease-based conversation lock serializes merchant engagement, AI-owned execution, takeover State Tools, Layer2, and generation changes.
13. Block A never re-acquires the lock.
14. Every lock acquisition has a matching finally release.
15. Merchant engagement increments layer2Generation before opening the new AI window.
16. A silenced conversation remains human-owned until merchant engagement closes it.
17. Layer2 de-escalates only after a successful response (or after silent consumption).
18. Inbound messageId processing is idempotent via atomic claim.
19. The stale sweep re-checks pending jobs and re-reads generation atomically.
20. Every active escalation has one durable escalationEventId.
21. Every escalation notification uses conversationId:escalationEventId via durable outbox.
22. Threshold, UNKNOWN, and explicit escalateConversation paths reuse the same active escalation event.
23. There is at most one consolidated customer response per processing window.
24. suppressAutoReply is the single canonical suppression flag.
