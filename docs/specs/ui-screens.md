# Spec: UI screens

- **Status:** proposed
- **Related:** `docs/REWORK_PLAN.md` Phase 5, [ui-foundation.md](ui-foundation.md)
- **Rule:** no screen ships before the foundation is merged. Each screen ships behind a flag and replaces the old route only at parity.

## 1. Information architecture

| Route | Purpose | Replaces |
|---|---|---|
| `/dashboard` | Overview: needs attention, agent pulse, recent activity | current fake dashboard |
| `/dashboard/inbox` | Conversations, takeover, send | **new** |
| `/dashboard/orders` | Order ledger + detail drawer | current Orders |
| `/dashboard/catalog` | Products, agent visibility | current Catalog |
| `/dashboard/customers` | Customers, history, block | current Customers |
| `/dashboard/escalations` | Resolve handovers in-app | current Escalations |
| `/dashboard/settings/agent` | Agent behavior | Settings tab |
| `/dashboard/settings/channels` | WhatsApp + store | Settings tabs |
| `/dashboard/settings/delivery` | Carriers, wilaya pricing | Settings tab |
| `/dashboard/settings/billing` | Plan, usage, invoices | Billing page |
| `/dashboard/settings/account` | Profile, security, language | Profile + Settings |

Rules:

- Daily work (Overview, Inbox, Orders, Escalations) is separate from configuration.
- No settings subtree inside the main nav; one Settings entry with routed sections.
- Global search in the command bar searches orders, customers, products, conversations.
- Every list route supports URL state: filters, sort, cursor, selected view. Shareable and back-button safe.

## 2. Overview

**Job:** answer "what needs me now" in under five seconds.

Layout:

1. Page header: greeting + date, agent status (active/paused/disconnected).
2. **Needs attention** queue: escalations, failed sends, disconnected WhatsApp, orders stuck in pending, agent errors. Each row: severity, title, context, age, one primary action, link to the object.
3. **Agent pulse**: confirmed today, waiting on customer, escalations, median response time. Text + sparkline, not four identical cards.
4. **Recent orders** table (last 8) with status and total.
5. Empty state when the account is new: connect WhatsApp, import catalog, done.

Rules:

- All numbers come from one `/dashboard/summary` endpoint. No client-side fabrication.
- No `Math.random()`. No placeholder KPIs. If a metric is not available, hide it.
- "Needs attention" is ordered by severity then age; max 5 visible, "view all" expands.
- Each item links to the object that fixes it.

Acceptance:

- [ ] Zero hardcoded sample rows or random values.
- [ ] Every KPI has a defined source query and a tooltip explaining the window.
- [ ] Queue item click lands on the exact order/conversation/setting.
- [ ] Loading, empty, error, and partial-failure states exist.
- [ ] Summary endpoint p95 < 300ms with 10k orders.

## 3. Inbox

**Job:** let a human take over a conversation and reply without leaving the dashboard. This is the product's missing core screen.

Layout: three panes on desktop, one pane at a time on mobile.

```
┌──────────────┬───────────────────────────┬──────────────┐
│ Conversations│ Thread                    │ Context      │
│ ● Amina  2m  │ customer: ...             │ Order #0047  │
│ ● Karim 15m  │ agent: ...                │ Product ...  │
│              │ [Take over] [Reply...]    │ Address ...  │
└──────────────┴───────────────────────────┴──────────────┘
```

Requirements:

- Conversation list: unread, last message preview, owner (AI/human), status, age, filters (all, needs human, escalated, mine).
- Thread: full history, grouped by day, AI vs merchant vs customer labels, media thumbnails/transcripts, delivery state per outbound message, timestamps.
- Composer: text, quick replies, attach image, send. Disabled with an explanation when WhatsApp is disconnected.
- Takeover/handback: one action, confirmed, writes `takenOverByHuman`; agent stops replying immediately.
- Context pane: customer, current order, address, products discussed, escalation reason, recent orders.
- Real-time: new messages appear without reload (SSE/WebSocket or polling fallback). No duplicate rows on reconnect.
- Sending is optimistic but reconciles with the outbox state; a failed send shows retry.

Acceptance:

- [ ] Merchant can read history, take over, reply, and hand back without `wa.me`.
- [ ] Agent never sends while a human owns the conversation (tested).
- [ ] New inbound message appears in < 2s with the socket, < 10s with polling fallback.
- [ ] Outbound bubble shows queued/sent/failed from the outbox, not optimistic fiction.
- [ ] Media renders with alt text and a transcript when available.
- [ ] Keyboard: `j/k` navigate list, `Enter` open, `Esc` close, `⌘Enter` send.
- [ ] Mobile: list → thread → back, composer pinned above the safe area.
- [ ] Empty state when no conversations; skeleton on first load.

## 4. Orders

**Job:** find an order, understand its state, act on it.

Layout:

- Full-width ledger table. Hairline rows, tabular numbers, sticky header.
- Saved views: All, Needs action, Pending confirmation, Confirmed, Shipped, Delivered, Failed/Cancelled.
- Columns: order id, customer, phone, product, wilaya, total, status, agent state, age. Column picker + density toggle.
- Row click opens a right drawer: summary, customer, address, conversation timeline, tracking, actions.
- Bulk bar at the bottom with count and confirmation for destructive actions.
- Mobile: cards with the same fields, action sheet.

Rules:

- Status vocabulary and colors identical to Overview and Inbox.
- One action model: confirm, cancel, hold/resume agent, add tracking, ship. Disabled states explain why.
- No duplicate filter options. `SHIPPED` and `DELIVERED` are distinct.
- Bulk actions confirm and report per-row results, with retry for failures.
- Order detail shows the conversation, so the merchant never guesses context.

Acceptance:

- [ ] Table sorts by every visible column; `aria-sort` set.
- [ ] Filters and view persist in the URL.
- [ ] Drawer deep-links (`/dashboard/orders/:id`) and survives refresh.
- [ ] Bulk confirm/cancel requires confirmation and shows a result summary.
- [ ] Failed rows are retryable individually.
- [ ] Mobile layout has no horizontal scroll.
- [ ] 10k rows paginate without layout shift; p95 first render < 1s.

## 5. Escalations

**Job:** clear the handover queue.

- List of escalated conversations with reason, age, customer, last message, order context.
- Actions: open in Inbox, take over, resolve (with optional note), reassign to agent.
- Resolving sets `takenOverByHuman=false`, clears `escalatedAt`, and optionally sends a closing message.
- Count in the nav is the server total, not the loaded page length.

Acceptance:

- [ ] Resolve works in-app; no `wa.me` redirect.
- [ ] Nav badge equals the server count.
- [ ] Reason is displayed and stored.
- [ ] Resolved item leaves the queue without a reload.
- [ ] Empty state explains what escalations are.

## 6. Catalog

- Grid/table toggle; search, category, stock, agent-enabled filters.
- Product detail drawer: images, price, stock, variants, description, agent visibility toggle.
- Bulk enable/disable for the agent, with confirmation.
- Import/sync status from the store connection, with a retry.
- No client-side LLM calls.

Acceptance:

- [ ] Agent-enabled toggle persists and is reflected by the agent (verified by a tool test).
- [ ] Broken image has a fallback, never an empty box.
- [ ] Sync errors are visible with a retry.
- [ ] Bulk toggle confirms and reports results.

## 7. Customers

- Table: name, phone, wilaya, orders, last order, blocked.
- Detail drawer: profile, orders, conversations, block/unblock.
- Blocking is enforced on the message path and explained in the UI.

Acceptance:

- [ ] Block/unblock persists and takes effect on the next inbound message.
- [ ] Customer detail links to their orders and conversations.
- [ ] Phone numbers are formatted and copyable; monospaced.

## 8. Settings

Split the 1,396-line component into routed sections, each with its own form, save bar, and dirty state.

| Section | Contents |
|---|---|
| Agent | active toggle (enforced), language, tone, escalation threshold, follow-up delays (only if implemented) |
| Channels | WhatsApp connect/disconnect/QR, store connection, sync status |
| Delivery | carrier credentials, connect/test, wilaya pricing table, bulk edit |
| Billing | plan, usage, invoices, payment method (or remove the section) |
| Account | name, email, password, sessions, language, theme |

Rules:

- One save bar per section, sticky, disabled until dirty.
- Test-connection action next to credentials.
- Never show raw template placeholders like `{clientName}`; use a labeled field or a preview.
- Destructive actions confirm and explain consequences.
- No duplicated labels; each field has one label and one hint.
- Every setting is read by the backend, or it is removed from the UI. No facade settings.

Acceptance:

- [ ] No settings file over 300 lines; each section is its own route and component.
- [ ] Save is disabled until dirty; navigating away warns.
- [ ] Every field round-trips through the API and is used by the backend (test per field).
- [ ] Agent active toggle actually stops replies (integration test).
- [ ] Test-connection returns a clear success/failure.
- [ ] Follow-up settings are hidden if follow-ups are not implemented.

## 9. Onboarding

- Store connection with clear provider choice and skip.
- WhatsApp setup: QR with expiry countdown and refresh, polling with timeout and error state, "connected" confirmation.
- Agent config with a live preview of a sample reply.
- Activation checklist that reflects real state.

Acceptance:

- [ ] QR refreshes automatically before expiry and on demand.
- [ ] Polling stops on success, timeout, or unmount.
- [ ] Every step is resumable after refresh.
- [ ] Errors explain the fix and offer retry.
- [ ] A merchant can finish onboarding without support.

## 10. Auth

- Login, signup, forgot password, reset password, verify email.
- No fake dev session fallback on network errors.
- Field-level errors, password visibility toggle with label, caps-lock hint.
- Rate-limit feedback is human.

Acceptance:

- [ ] Forgot-password link resolves to a real route and sends a real email.
- [ ] Network failure shows a retry, never a fake login.
- [ ] All inputs have labels and autocomplete attributes.
- [ ] Keyboard-only login works.

## 11. Cross-screen rules

- Every screen: loading skeleton, empty state with one action, error state with retry, permission state.
- Every destructive action: confirm, explain, and offer undo where possible.
- Every list: URL state, keyboard navigation, accessible name.
- Every number: `Intl` formatting, tabular in tables.
- Every date: relative for recent, absolute on hover/focus.
- Every status: same token and label everywhere.
- No screen ships with placeholder data, disabled links, or "coming soon".
- Mobile first check at 320px, 375px, 768px; desktop at 1280px and 1440px.
