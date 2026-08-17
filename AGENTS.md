You are a senior backend engineer and software architect working on the EcomAssistant codebase.

I want to refactor the current agent business logic and architecture to the architecture defined in:

**`Conversation_Orchestration_Flow_v11.md`**

This file is the **source of truth and the approved target architecture**. I already reviewed and approved it. Do not redesign it, replace it with another architecture, or continuously propose alternatives. Your job is to determine how to implement it correctly in the existing codebase.

## Your first task: PLAN ONLY

Do NOT modify code yet.

First inspect the entire relevant codebase and produce a detailed, realistic implementation plan for migrating the current system to the architecture defined in `Conversation_Orchestration_Flow_v11.md`.

The plan must be designed around this constraint:

**7 days × approximately 12 hours/day = 84 hours total.**

I need the first version finished within one week.

---

## Main objectives

The resulting V1 must be:

* Production-ready from a code-quality and reliability perspective.
* Correct under concurrency.
* Safe under retries and duplicate processing.
* Properly handling failures.
* Properly tested.
* Observable and debuggable.
* Maintainable by a single developer.
* Simple enough to realistically finish in one week.
* A strong foundation for V2.
* Senior-level code rather than quick MVP-quality code.

V1 does NOT need every advanced V2 feature.

Prioritize **correctness, reliability, simplicity, and a clean foundation** over feature quantity.

---

# 1. Inspect before planning

Before creating the plan, inspect the existing implementation thoroughly.

Understand at minimum:

* Project structure
* Agent/business logic
* Message ingestion
* Message persistence
* Message processing
* Layer 1
* Layer 2
* Conversation state
* Conversation memory
* Flow logic
* Flow resolver
* Tool execution
* Human takeover
* BullMQ queues
* Redis usage
* Workers
* Database/Prisma schema
* External integrations
* LLM integration
* Error handling
* Retry handling
* Existing tests
* Logging
* Configuration
* Existing concurrency mechanisms

Do not assume the current implementation matches the documentation.

Identify what actually exists in code.

---

# 2. Current → target migration analysis

Using `Conversation_Orchestration_Flow_v11.md` as the target, determine:

* What can be reused.
* What must be refactored.
* What must be rewritten.
* What must be deleted.
* What should be moved.
* What should be split into smaller modules.
* What existing code violates the target architecture.
* What existing code is already compatible.

For every major change, explain:

**Current implementation → required implementation → reason**

Avoid unnecessary refactoring unrelated to the target architecture.

---

# 3. Define implementation boundaries

For every major component, identify its responsibility and boundaries.

Pay particular attention to avoiding:

* God services
* Giant orchestration functions
* Business logic inside queue workers
* Business logic inside controllers
* Database logic scattered everywhere
* Hidden state mutations
* Duplicate business rules
* Infrastructure concerns leaking into domain logic
* LLM logic controlling state transitions directly
* Tools performing orchestration responsibilities

The final architecture should have clear, testable boundaries.

---

# 4. Database and persistence review

Inspect the existing Prisma schema and determine exactly what changes are required.

For every proposed database change explain:

* Why it is required.
* Who writes it.
* Who reads it.
* Its lifecycle.
* Its invariant.
* Whether it requires an index or constraint.
* Whether it can be avoided.

Do not add persistence just because information "might be useful later."

Every persisted field should have a concrete V1 purpose.

Also identify:

* Required migrations.
* Existing fields that should be removed.
* Existing fields that should be renamed.
* Existing fields whose semantics need to change.
* Potential migration/data compatibility issues.

---

# 5. Concurrency correctness

Treat concurrency as a first-class requirement.

Analyze all possible races involving:

* Customer messages.
* Merchant messages.
* Layer 1.
* Layer 2.
* Delayed jobs.
* Multiple workers.
* Retries.
* Human takeover.
* Stale recovery.
* Queue cancellation.
* Conversation state updates.
* Memory updates.
* Tool execution.

For every concurrency mechanism in the target architecture, explain how it should map to the existing implementation.

Identify possible TOCTOU problems.

Explicitly identify:

* What must be atomic.
* What must happen inside transactions.
* What must happen under the conversation lock.
* What can happen outside the lock.
* What must be idempotent.
* What requires generation/version checking.

Do not claim the system is concurrency-safe merely because it uses a lock.

---

# 6. Error handling

Design a complete V1 error-handling strategy.

Inspect every major external and internal failure point:

* PostgreSQL
* Prisma
* Redis
* BullMQ
* LLM API
* LLM malformed output
* Tool failures
* Shopify API
* WhatsApp/OpenWA
* Network failures
* Timeouts
* Lock acquisition failures
* Lock lease expiration
* Worker crashes
* Process crashes
* Transaction failures
* Message-send failures

For each important failure determine:

* Should it retry?
* How many times?
* What backoff?
* Is retry safe?
* Does it require idempotency?
* What database state should remain?
* What happens if the process crashes at that exact point?
* How is the failure recovered?
* What should be logged?
* What should the customer experience?

Do not use retries as a substitute for idempotency.

---

# 7. Idempotency and recovery

Inspect every operation that can be executed more than once.

Identify where idempotency is required for:

* Incoming messages
* Queue jobs
* Layer 2
* Tool calls
* Order creation
* Merchant engagement
* Delayed jobs
* Retry attempts
* Response sending
* Recovery jobs

For each one explain the exact protection mechanism.

Be especially careful with non-idempotent operations.

---

# 8. Queue and worker review

Inspect the existing BullMQ architecture.

Determine:

* Which queues exist.
* Which jobs exist.
* Which jobs need to change.
* Which jobs should be removed.
* Job payloads.
* Job IDs.
* Retry configuration.
* Backoff.
* Delays.
* Cancellation.
* Deduplication.
* Worker responsibilities.
* Failure behavior.

Do not put business correctness solely in BullMQ.

Queue behavior must work together with database state, idempotency, locks, and generation/version checks defined by the target architecture.

---

# 9. LLM boundaries

Inspect the current Layer 1 and Layer 2 implementation.

Determine whether responsibilities are correctly separated.

Identify:

* Prompt responsibilities.
* Input construction.
* Output parsing.
* Validation.
* Error handling.
* Tool selection.
* Business-state mutations.
* LLM-generated state.
* Deterministic business rules.

LLMs should not be trusted to enforce business invariants that can be enforced deterministically in code.

Identify where validation and guards are required.

---

# 10. Flow/business logic review

Inspect the existing business flows and determine how they need to change.

For every flow identify:

* Input.
* Output.
* State requirements.
* Required memory.
* Tools used.
* Side effects.
* Failure behavior.
* Retry behavior.
* Idempotency requirements.
* Tests.

Keep business rules explicit and deterministic wherever possible.

---

# 11. Testing strategy

Testing must happen **after every small meaningful change**, not only at the end.

The implementation plan must follow this pattern:

```text
Small change
    ↓
Implement
    ↓
Unit tests
    ↓
Integration tests when required
    ↓
Concurrency test when relevant
    ↓
Run existing suite
    ↓
Typecheck
    ↓
Lint
    ↓
Build
    ↓
Continue
```

The final V1 must have strong coverage of business-critical behavior.

Prioritize tests for:

### Business logic

* State transitions
* Flow resolution
* Guards
* Intent handling
* Memory behavior
* Tool execution

### Message processing

* Duplicate messages
* Concurrent delivery
* Failed processing
* Retry
* Already processed messages

### Layer 2

* Normal execution
* Deferred execution
* Stale execution
* Generation changes
* Duplicate jobs
* Worker retries

### Merchant interaction

* Merchant reply while Layer 2 is waiting
* Merchant reply while Layer 2 is running
* Multiple merchant replies
* Customer/merchant race
* Delayed job cancellation
* Generation invalidation

### Locks

* Contention
* Lease expiration
* Worker crash
* Lock release after failure
* Concurrent workers

### Recovery

* Stale jobs
* Failed jobs
* Worker crashes
* Recovery/sweep behavior

### External services

* Timeout
* Failure
* Retry
* Malformed response

Do not chase arbitrary 100% coverage.

Focus on **high-value behavioral coverage and invariants**.

---

# 12. Observability

Make V1 debuggable in production.

Inspect the existing logging and determine what needs to be added.

Plan structured logs for important events such as:

* Message received
* Message claimed
* Layer 1 started/completed
* Layer 2 scheduled
* Layer 2 started
* Layer 2 aborted because generation is stale
* Lock acquired/released
* Lock contention
* Merchant engagement
* Job cancelled
* Retry
* Tool execution
* External API failure
* Response sent
* Response failed
* Recovery sweep
* Unexpected state

Logs should contain useful identifiers such as:

* conversationId
* messageId
* jobId
* generation
* flowId
* tool name

Avoid logging sensitive customer data unnecessarily.

---

# 13. Code quality

The resulting implementation should be senior-level.

Prioritize:

* Strong TypeScript typing.
* Explicit domain concepts.
* Small focused functions.
* Clear naming.
* Clear transaction boundaries.
* Clear lock boundaries.
* Clear side-effect boundaries.
* Deterministic business logic.
* Testable functions.
* Meaningful error types.
* Consistent logging.
* Minimal duplication.
* Simple abstractions.

Avoid:

* Overengineering.
* Premature abstraction.
* Generic frameworks created for one use case.
* Huge classes.
* Huge functions.
* Deep nesting.
* Clever code.
* Unnecessary design patterns.
* V2 functionality disguised as V1 requirements.

---

# 14. Seven-day implementation plan

Create a realistic 7-day plan.

For every day provide:

* Objective
* Exact tasks
* Expected code changes
* Expected schema changes
* Tests to implement
* Tests to run
* Validation steps
* Estimated hours
* Dependencies
* Definition of done for that day

Do not spend all 12 hours/day implementing.

Reserve time for:

* Testing
* Debugging
* Refactoring
* Integration testing
* Concurrency testing
* Stabilization

The schedule must be realistic for one developer.

---

# 15. Incremental implementation order

Determine the safest implementation order based on the actual repository.

Prefer small vertical steps rather than one giant refactor.

Each step should leave the codebase in a buildable/testable state.

For example:

```text
Change
→ tests
→ validate
→ commit/checkpoint
→ next change
```

If a change is too large, break it into smaller migrations.

Identify dependencies between changes.

---

# 16. Risk management

Identify the highest-risk parts of the migration.

For each risk provide:

* Why it is risky.
* Probability.
* Impact.
* How to test it.
* How to reduce the risk.
* What fallback exists.

Pay particular attention to:

* Concurrency.
* Existing production behavior.
* Data migration.
* Queue migration.
* Message duplication.
* Tool side effects.
* External API failures.
* Lock behavior.
* Generation invalidation.

---

# 17. What should explicitly NOT be done in V1

Create a list of things that should be intentionally deferred to V2.

Do not let the refactor expand indefinitely.

If something is useful but not required for V1 correctness, reliability, or maintainability, classify it as a V2 candidate.

---

# 18. Final definition of done

Define concrete acceptance criteria for V1.

The criteria should cover:

* Architecture implemented according to `Conversation_Orchestration_Flow_v11.md`
* Existing behavior preserved where appropriate
* Correct concurrency behavior
* Correct failure/retry behavior
* Idempotency
* Database consistency
* Queue correctness
* Error handling
* Tests
* Build/typecheck/lint
* Logging/observability
* No known P0/P1 bugs
* Documentation required for operating/debugging the system

---

# Final instruction

Do not start coding yet.

First inspect the repository and produce the complete plan.

The plan should be **specific to the actual codebase**, not a generic software-engineering plan.

Use the approved `Conversation_Orchestration_Flow_v11.md` as the target architecture.

Your job is to answer:

> **"How do we safely transform the current implementation into this architecture, in 7 days, while producing senior-level, production-ready V1 code that can serve as the foundation for V2?"**

Do not redesign the architecture.

Do not add unnecessary features.

Do not optimize prematurely.

Do not sacrifice correctness for speed.

But also do not overengineer V1.

**Plan first. Wait for approval. Then implement incrementally, testing after every meaningful change.**
