# 04: Real end-to-end check of the order flow

**What to build:** a real run (real agent in Docker, real tools in back, real LLM) that proves a customer can order, in French and in Derdja. Each run is traced in LangSmith (project `ecomassistant-dev`) so the user can review it.

Use a new clean test customer (the user said yes to one INSERT in the dev DB). The old French customer (+213550000112) has dirty history. Space messages about 60 s apart (free LLM rate limits).

Scenario per language:
1. Search products (2 results), then pick one by name
2. Give the place in pieces ("Oran", then the commune, then "Cité 200 logements")
3. One failed order (a wrong commune), then the fix
4. Order created and confirmed

**Blocked by:** 01, 02, 03

**Status:** partly done (see notes/order-flow-fixes-summary.md)

- [ ] An order is created in French and in Derdja (checked in the `Order` table)
- [ ] The agent never asks for a "product ID"
- [ ] The failed order is fixed without asking the other fields again
- [ ] The street keeps its number, and the quantity is right
- [ ] A short report, with the LangSmith trace of each run
