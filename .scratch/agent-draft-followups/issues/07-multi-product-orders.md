# One order with many products (a cart)

Status: needs-triage

## What

A customer writes "I want the shoes and a shirt" in one message.
Today the agent makes one order for one product only. The second product is not ordered.
The customer has to ask for it in a new message.

This was already so before the retry work. It is a missing feature, not a bug from a change.

## Idea

One order can hold many items.
One customer message makes one order with all the items.
The delivery cost is paid once.

## Facts

- `Order` in `back/prisma/schema.prisma` has one `productId`, one `productName` and one `quantity`. It cannot hold two products.
- `createOrder` takes one `productId` and one `quantity` (`ecom_agent/tools/registry.py`, `back/src/modules/ai/tools/registry.ts`).
- A Draft is one tool call, so it collects one product (`ecom_agent/drafts.py`).
- Same product, many units ("5 shoes") works today: one order with `quantity = 5`.
- The idempotency key is the message id: one customer message makes at most one order (see `docs/adr/0001-one-order-per-customer-message.md`). A cart fits this rule.
- Today, if the model returned two `createOrder` calls in one Turn, the second would return the first order and no second order would be made. With a cart, this is the right behavior.

## Open questions

- A new `OrderItem` table (order id, product id, name, unit price, quantity)? What happens to the old `productId` / `quantity` columns on `Order`?
- How does the Draft collect several products? One Draft with a list of items?
- Stock is checked per item. If one item is out of stock, is the whole order refused, or only that item?
- How do `modifyOrder`, `confirmOrder` and the confirmation message show many items?
- Does the dashboard (`front/`) show many items per order?
- Shopify orders already have line items. Do they use the same table?
