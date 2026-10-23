# 01: French "la" does not cancel the order

**What to build:** a French customer can say "la" ("the") while an order is open without cancelling it. "je veux la rouge" and "la Montre Casio" keep the Draft. "la" cancels only when it is the whole message (Derdja "no"), with or without punctuation ("la", "La!", "la."). The other cancel words work as before.

A longer Derdja message with "la" inside (for example "la ma nebghich") no longer cancels by rule. The gate LLM decides it, like any other message.

From: e2e bug 14 (`.scratch/e2e-2026-10-19/issues/14-french-la-cancels-the-draft.md`).

Branch: `fix/french-la-cancel`, from `dev`.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] "la" alone cancels an open Draft
- [ ] "je veux la rouge" and "la Montre Casio" do not cancel it
- [ ] "khaleh", "cancel" and the other cancel words still cancel
- [ ] Tests at the Draft gate (scripted LLM)
