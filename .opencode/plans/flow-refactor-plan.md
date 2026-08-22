# Phase 1: Flow-Based Agent Architecture Refactor

## Scope

Refactor conversation memory from flat structure to flow-based. Introduce FlowResolver and FlowProcessor as pure modules. Update all consumers. **No concurrency integration** -- conversationLock.ts stays separate and untouched.

## Pre-conditions

- Logger infrastructure: back/src/lib/logger.ts (done)
- Conversation lock: back/src/lib/conversationLock.ts (done, committed separately)
- Target architecture: Conversation_Orchestration_Flow_v11.md
- **Testing framework**: vitest (must be installed before Step 2)

## Testing setup

- Framework: **vitest** (not node:test)
- Config file: back/vitest.config.ts (new)
- Test script in package.json: `"test": "vitest run"`, `"test:watch": "vitest"`
- Assertions: vitest's `describe/it/expect` (NOT node:assert/strict)
- Existing tests must be migrated from node:test to vitest as part of Step 1

## Execution model

Each step leaves the codebase in a buildable, testable state. Commit after each step. Run `pnpm test`, `npx tsc --noEmit`, and `pnpm lint` after every step.

## Current file inventory (6 files touch memory)

| File | Role |
|---|---|
| memory.types.ts | Flat type definition |
| agent.service.ts | Loads, mutates, persists - single hub (876 lines) |
| tools/registry.ts | Reads memory for product resolution, suggestProducts |
| tools/suggestionHelpers.ts | Reads entities, lastProductResults, rejectedProducts |
| prompts/promptBuilder.ts | Serializes memory into LLM prompts |
| conversationState.ts | TOOL_STATE_TRANSITIONS - tools update conversation.state directly |

---

## Step 1: Set up vitest + migrate existing tests

**Estimated time**: 2-3 hours

### Tasks

- [ ] Install vitest as devDependency
- [ ] Create back/vitest.config.ts
- [ ] Update package.json scripts to use vitest
- [ ] Migrate all existing tests from node:test to vitest (import replacement + assertion replacement)
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add -A
git commit -m "chore: add vitest, migrate tests from node:test"
```

---

## Step 2: New memory.types.ts + migrateMemory()

**Estimated time**: 3-4 hours
**Depends on**: Step 1

### Tasks

- [ ] Rewrite memory.types.ts: delete old types, add FlowState/Filter/FlowVariant/FlowProduct/Flow/ConversationMemory
- [ ] Add helpers: migrateMemory(), createFlow(), getActiveFlow(), findFlowById()
- [ ] Write tests: back/src/modules/ai/__tests__/memoryMigration.test.ts (new)
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/memory.types.ts back/src/modules/ai/__tests__/memoryMigration.test.ts
git commit -m "feat: flow-based ConversationMemory types with migration"
```

---

## Step 3: FlowResolver -- pure function + tests

**Estimated time**: 4-5 hours
**Depends on**: Step 2

### Tasks

- [ ] Create flowResolver.ts with IntentCategory, FlowResolverInput, FlowResolverOutput, FlowCandidate types
- [ ] Implement classifyIntent(), scoreFlow(), resolveFlow() + internal helpers
- [ ] Write tests: back/src/modules/ai/__tests__/flowResolver.test.ts (new) -- all resolver paths
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/flowResolver.ts back/src/modules/ai/__tests__/flowResolver.test.ts
git commit -m "feat: add pure FlowResolver for intent-to-flow routing"
```

---

## Step 4: FlowProcessor -- pure functions + tests

**Estimated time**: 4-5 hours
**Depends on**: Step 2

### Tasks

- [ ] Create flowProcessor.ts with TOOL_FLOW_STATE_MAP constant
- [ ] Implement transitionState(), recordProductResults(), clearProductResults(), recordOrder(), applyToolResult(), persistFlowMemory()
- [ ] Write tests: back/src/modules/ai/__tests__/flowProcessor.test.ts (new) -- state transitions, deep clone, tool result application
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/flowProcessor.ts back/src/modules/ai/__tests__/flowProcessor.test.ts
git commit -m "feat: add FlowProcessor for flow state mutation and persistence"
```

---

## Step 5: Refactor suggestionHelpers.ts

**Estimated time**: 2-3 hours
**Depends on**: Step 2
**Why before registry.ts**: registry.ts imports from suggestionHelpers

### Tasks

- [ ] Refactor computeExclusionIds() to accept Flow instead of ConversationMemory
- [ ] Refactor consolidatePreferences() to accept flowFilter + globalInfo instead of flat memory
- [ ] Update suggestionHelpers.test.ts with new types
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/tools/suggestionHelpers.ts back/src/modules/ai/__tests__/suggestionHelpers.test.ts
git commit -m "refactor: suggestionHelpers to read from Flow instead of flat memory"
```

---

## Step 6: Refactor promptBuilder.ts

**Estimated time**: 2-3 hours
**Depends on**: Step 2

### Tasks

- [ ] Add activeFlow to AgentContext, update buildIntentPrompt to read from activeFlow.productDiscovery.toolResults
- [ ] Update ReplyContext memory type to new ConversationMemory
- [ ] Update promptBuilder.test.ts with new fixtures
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/prompts/promptBuilder.ts back/src/modules/ai/__tests__/promptBuilder.test.ts
git commit -m "refactor: promptBuilder to use new ConversationMemory shape"
```

---

## Step 7: Refactor tools/registry.ts

**Estimated time**: 4-5 hours
**Depends on**: Steps 2, 4, 5

### Tasks

- [ ] Replace ToolExecutionContext fields (currentOrderId/currentProductId/lastProductResults) with single activeFlow: Flow | null
- [ ] Refactor each tool handler to read from activeFlow instead of flat memory fields
- [ ] Remove TOOL_STATE_TRANSITIONS writes and direct state mutations (FlowProcessor handles this now)
- [ ] Update tool tests with new context shape
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/tools/registry.ts
git commit -m "refactor: tools to use activeFlow context instead of flat memory fields"
```

---

## Step 8: Refactor agent.service.ts

**Estimated time**: 5-6 hours
**Depends on**: Steps 2, 3, 4, 5, 6, 7

### Tasks

- [ ] Replace all memory loading with migrateMemory()
- [ ] Delete persistMemory() function, replaced by FlowProcessor.persistFlowMemory
- [ ] Add flow resolution in processMessage() using resolveFlow + classifyIntent
- [ ] Wire FlowProcessor.applyToolResult into tool execution pipeline
- [ ] Refactor processDeferredLayer2() to use migrateMemory -> resolveFlow -> persistFlowMemory
- [ ] Replace rejectedToRecord pattern with flow-level clearProductResults
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/agent.service.ts
git commit -m "refactor: agent.service to use FlowResolver and FlowProcessor"
```

---

## Step 9: Deprecate conversationState.ts

**Estimated time**: 1 hour
**Depends on**: Step 7

### Tasks

- [ ] Add @deprecated JSDoc to TOOL_STATE_TRANSITIONS and nextConversationState
- [ ] Remove import from registry.ts (Step 7 already removes usage)
- [ ] Keep file and existing tests for backward compat reference
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/conversationState.ts
git commit -m "chore: deprecate conversationState.ts (replaced by FlowProcessor)"
```

---

## Step 10: Integration tests

**Estimated time**: 3-4 hours
**Depends on**: Steps 2-8

### Tasks

- [ ] Create flowIntegration.test.ts with 8 end-to-end scenarios (mocked LLM + tools)
- [ ] Cover: fresh conversation, product selection, order creation, new search during order, order confirmation, invalid action, flow switching, backward compat migration
- [ ] Validate: pnpm test, npx tsc --noEmit, pnpm lint

### Commit

```
git add back/src/modules/ai/__tests__/flowIntegration.test.ts
git commit -m "test: add integration tests for flow-based architecture"
```

---

## Step 11: Final cleanup and commit

**Estimated time**: 1-2 hours
**Depends on**: Steps 1-10

### Tasks

- [ ] Update any remaining test fixtures across all test files
- [ ] Full test suite pass: pnpm test
- [ ] Full typecheck: npx tsc --noEmit
- [ ] Full lint: pnpm lint
- [ ] Final commit

### Commit

```
git add -A
git commit -m "refactor: flow-based conversation memory with FlowResolver and FlowProcessor"
```

---

## Summary of files

| File | Action | Purpose |
|---|---|---|
| memory.types.ts | Rewrite | Flow types + migrateMemory + helpers |
| flowResolver.ts | New | Pure flow resolution logic |
| flowProcessor.ts | New | Pure flow state mutation + persistence |
| agent.service.ts | Major refactor | Wire FlowResolver + FlowProcessor, remove flat memory |
| tools/registry.ts | Medium refactor | activeFlow context, remove state writes |
| tools/suggestionHelpers.ts | Medium refactor | Read from flow instead of flat memory |
| prompts/promptBuilder.ts | Medium refactor | New memory shape in prompts |
| conversationState.ts | Deprecate | Keep for backward compat |
| __tests__/memoryMigration.test.ts | New | Migration + helper tests |
| __tests__/flowResolver.test.ts | New | Resolver tests |
| __tests__/flowProcessor.test.ts | New | Processor tests |
| __tests__/flowIntegration.test.ts | New | Integration tests |
| __tests__/suggestionHelpers.test.ts | Update | New types |
| __tests__/promptBuilder.test.ts | Update | New types |

---

## Estimated total time: 32-41 hours
