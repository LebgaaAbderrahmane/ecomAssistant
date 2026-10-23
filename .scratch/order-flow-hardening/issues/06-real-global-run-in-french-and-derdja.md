# 06: Real global run in French and Derdja

**What to build:** a real run (real agent in Docker, real tools in `back`, real LLM) of the whole order flow in French and in Derdja, checked in the database, with a report. Run it on a local test branch that merges tickets 01 to 04 (not pushed), because each fix has its own branch. Also run the eval cases of ticket 05 with `--local`.

Use a new clean Derdja test customer (1 INSERT in the dev DB; the user said yes). The old customers have dirty history, and +213550000111 is still taken over by a human. Messages about 60 s apart (free LLM rate limits). LangSmith traces are not available (monthly limit).

Scenario per language: search, pick a product by name, give the place in pieces ("Oran", then the commune, then "Cité 200 logements"), one failed order (a wrong commune) and the fix, order created, then the customer confirms or cancels. Also a French sentence with "la" in the middle of an order.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] An order is created in French and in Derdja (checked in the `Order` table)
- [ ] No "product ID" question, no tool name in a reply, no cancel on "la"
- [ ] The street keeps its number and the quantity is right
- [ ] A failed order is fixed without asking the other fields again
- [ ] The eval cases pass, or the failures are listed
- [ ] A report in `notes/` with what failed and the new bugs found (each as a note in `.scratch/`)
