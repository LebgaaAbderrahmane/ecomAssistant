# A corrected wilaya is not saved to the Conversation notes

Status: needs-triage

I found this by reading the code. I did not run it. It may be a bug.

## What

While a draft is still collecting, the customer corrects the wilaya.
The order uses the new wilaya. The saved notes keep the old one.

## Example

1. Customer: "Oran, Bir El Djir". The street is still missing, so the draft stays open.
2. Customer: "no, Alger".
3. The args LLM call puts `wilaya = Alger` into `draft.args`.
4. The address LLM call only fills the fields that are still missing. The wilaya is not missing, so it is skipped.
5. `global_information.wilaya` stays `Oran`.
6. `createOrder` runs with `Alger`.

## Where

- `ecom_agent/drafts.py`: `collect` and `_collect_address`

## Facts

- The notes can disagree with the order.
- `check_llm` shows the saved address from the notes in its prompt, so it can see the old wilaya.
- I am not sure what else reads the saved wilaya.
- The draft refactor must not change this. Fix it in a separate change.

## Open questions

- Should a correction in the args update the notes too?
- Which value wins when they disagree?
