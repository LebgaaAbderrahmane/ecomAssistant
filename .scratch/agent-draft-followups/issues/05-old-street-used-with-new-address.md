# The old saved street is used with a new wilaya and commune

Status: done (branch `fix/address-rule`, with issue 04)

Decided: a new wilaya or commune drops the saved street, so the agent asks for it. The same place keeps the street, silently. The notes keep the latest address. Fixed in `drafts.py::_save_place`.
The same place is compared without case, accents or extra spaces. "Alger" and "16" count as different, so the agent asks once more.

I found this by reading the code and by asking "what if the customer is not at home?". I did not run it. It may be a bug.

## What

The customer orders a second time and gives a different wilaya and commune.
The agent does not ask for the street.
`ready_call` adds the old saved street from the notes, silently.
The order can end up with the new wilaya and commune and the old street.

## Example

1. Order 1: "Oran, Bir El Djir, Cité 200 logements". The notes save all three.
2. Order 2: "I want one more, ship it to Alger, Bab Ezzouar".
3. The args LLM puts `wilaya = Alger` and `commune = Bab Ezzouar` into `draft.args`.
4. The notes are complete, so `_missing_address` is empty. The address LLM does not run. The agent asks nothing.
5. The Draft is ready. `ready_call` finds no `address` in the args and adds `Cité 200 logements` from the notes.
6. `createOrder` runs with Alger, Bab Ezzouar and the street in Oran.

## Where

- `ecom_agent/drafts.py`: `ready_call` (adds the street) and `collect` (decides what is missing from the notes only)

## Facts

- Asking again for wilaya and commune on a new order is fine. The customer may ship somewhere else.
- The street is the problem: it is never asked when the notes already have one.
- A prompt change alone cannot fix it. When the args LLM gives wilaya and commune, the Draft is ready at once, and no question is asked.
- Related: issue 04 (a corrected wilaya is not saved to the notes).

## Open questions

- When the order's wilaya or commune differs from the notes, should the street count as missing, so the agent asks for it?
- Or should the agent ask "same address as last time?" before anything else?
- Should the notes keep the first address or the latest one?
