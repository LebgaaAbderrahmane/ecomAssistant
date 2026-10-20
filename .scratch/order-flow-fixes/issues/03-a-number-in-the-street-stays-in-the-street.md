# 03: A number in the street stays in the street

**What to build:** a number inside the street ("Cité 200 logements") stays in the street, in full. It never becomes the quantity. The quantity is set only when the customer says it for the product ("2 pieces", "jouj", "zwj"). Many Algerian addresses have numbers ("Cité 1000 logts"), so this is common.

Seen in the real test: Derdja gave `quantity: 200`, and French dropped the number ("Cité logements").

From: e2e bug 02 (`.scratch/e2e-2026-10-19/issues/02-number-in-the-street-becomes-the-quantity.md`).

**Blocked by:** None (can start immediately)

**Status:** done

- [ ] "Cité 200 logements" gives `address: "Cité 200 logements"` and no quantity
- [ ] "2 pieces" still gives `quantity: 2`
- [ ] A test covers the street case (the LLM part can only be checked for real in ticket 04)
