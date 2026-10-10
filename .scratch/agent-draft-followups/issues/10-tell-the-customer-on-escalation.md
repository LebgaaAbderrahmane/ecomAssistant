# Tell the customer when the agent hands over

Status: needs-triage
Blocked by: the teammate who owns `back` (the change is in `back`)

## What

When the agent escalates, the customer gets no message.
The chat just stops. The customer is left on read.
This is true for every Escalation, not only for issue 01.

## Idea

Send one short message before the hand-over.
`back` sends the message first, then turns Takeover on.

## Facts

- It is already noted in `docs/PROJECT_REPORT.md:103`.
- The `escalate` node calls the `escalateConversation` tool. The tool turns Takeover on (`back/src/modules/ai/tools/registry.ts:680`).
- With Takeover on, `back` drops every agent reply (`back/src/modules/whatsapp/reply.service.ts:90`). So a hand-over text cannot be sent after the tool ran.
- The ESCALATE answer has no text today (`ecom_agent/server.py:116`). `agentBridgeCore.ts` only turns Takeover on.
- The proto response already has a `text` field.
- Related: after 5 failed jobs nobody is escalated and the customer gets nothing (`docs/PROJECT_REPORT.md:182`).

## Open questions

- Fixed text or text written by the LLM? When the LLM is down, the text must be fixed.
- Which language? The agent knows the customer's language only when it ran the LLM.
- Which Escalations send a text? A message that is not from a customer must not get one.
- The agent must not call the tool before `back` sends the text. How do we change the `escalate` node for this?
- To check: one Escalation may make two dashboard notifications. The tool makes one, and `agent.bridge.ts` makes a second one. Not run, only read from the code.
