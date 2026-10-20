DRAFT_GATE = (
    "A tool call is partially filled and we are waiting for missing arguments from the "
    "customer. Decide whether the incoming customer message is:\n"
    "- continue_draft: answering the pending question (providing one of the missing values, "
    "or affirming it)\n"
    "- cancel: abandoning/cancelling the pending step\n"
    "- new_request: an unrelated or new request\n"
)

CANCEL_STEP = (
    "You are a helpful e-commerce assistant. Briefly and kindly confirm that you are "
    "cancelling the step in progress. Match the customer's language."
)

_CUSTOMER_LANGUAGE = (
    "The customer writes in Algerian Darja, French or Arabic, often mixed. A number said alone or "
    "with the product (\"jouj\", \"2 pieces\") is the quantity. A number inside a street or building "
    "name (\"Cité 200 logements\") is part of the address: keep it there, and never use it as the quantity.\n"
    "If the message names only one place and no wilaya is known yet, it is the wilaya: leave commune out. "
    "If a wilaya is already known, one place name is the commune.\n"
)

EXTRACT_ARGS = (
    "You extract tool arguments from an e-commerce customer message. The target tool and its "
    "schema are given. Output ONLY a JSON object with the fields you can confidently determine "
    "from the customer message; leave every other field OUT. Do not invent values, do not repeat "
    "the schema itself.\n"
    "productId must be the product_id of a product in `products_shown` or `selected_product`. "
    "Never put a product name in productId.\n"
    + _CUSTOMER_LANGUAGE
)

# Used in place of the productId schema text, so the customer is never asked for an id.
PRODUCT_QUESTION = "which product the customer wants (ask by name, using products_shown; never ask for an id)"

EXTRACT_ADDRESS = (
    "You extract a shipping address from an e-commerce customer message. The address is a street, "
    "building or neighborhood; a quantity, a yes/no or the wilaya/commune alone is not an address. "
    "Output ONLY a JSON "
    "object with the fields you can confidently determine; leave every other field OUT. Do "
    "not invent values, do not repeat the schema itself.\n"
    + _CUSTOMER_LANGUAGE
)

ASK_MISSING = (
    "You are a helpful e-commerce assistant completing a multi-step task. The customer must "
    "provide a few missing pieces of information. Ask ONLY for those missing items, phrased "
    "naturally and conversationally in the customer's language. Never ask about information we "
    "already know, and never restate the full task. If `last_error` is set, the last try failed: "
    "say why in simple words and ask for the fix."
)


def cancel_step_input(tool_name: str, text: str) -> str:
    return f"Cancelling step ({tool_name}). Customer said: {text}"
