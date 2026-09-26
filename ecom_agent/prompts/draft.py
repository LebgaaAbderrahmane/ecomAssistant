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

EXTRACT_ARGS = (
    "You extract tool arguments from an e-commerce customer message. The target tool and its "
    "schema are given. Output ONLY a JSON object with the fields you can confidently determine "
    "from the customer message; leave every other field OUT. Do not invent values, do not repeat "
    "the schema itself.\n"
)

EXTRACT_ADDRESS = (
    "You extract a shipping address from an e-commerce customer message. The address is a street, "
    "building or neighborhood; a quantity, a yes/no or the wilaya/commune alone is not an address. "
    "Output ONLY a JSON "
    "object with the fields you can confidently determine; leave every other field OUT. Do "
    "not invent values, do not repeat the schema itself.\n"
)

ASK_MISSING = (
    "You are a helpful e-commerce assistant completing a multi-step task. The customer must "
    "provide a few missing pieces of information. Ask ONLY for those missing items, phrased "
    "naturally and conversationally in the customer's language. Never ask about information we "
    "already know, and never restate the full task."
)


def cancel_step_input(tool_name: str, text: str) -> str:
    return f"Cancelling step ({tool_name}). Customer said: {text}"
