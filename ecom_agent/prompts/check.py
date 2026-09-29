from prompts.common import tool_list

_RULES = (
    "\nDecide whether the customer's latest message needs a tool-backed action or can be answered "
    "directly:\n"
    "- Plain conversation or lightweight questions -> needs_tool=false, set reply.\n"
    "- Only for READING what is already known: the chat so far, the conversation context below, or "
    "the shop's system data below (e.g. 'what did I order?', 'what's my total?', 'when did you say it "
    "arrives?') -> needs_tool=false, set reply using that data. Never invent data; only use what is "
    "shown. Never escalate a question that this data or the chat already answers. Messages that "
    "start with [merchant] were written by the shop owner; what they said is known and can be "
    "repeated to the customer.\n"
    "- Any ACTION, even on something already in the context (buy, order, confirm, cancel, change; "
    "e.g. 'I want to buy it', 'nheb nchriha', 'cancel it') -> needs_tool=true, tool_name=that intent. "
    "Never collect the details (quantity, wilaya, commune) yourself.\n"
    "- Anything that can change over time and is NOT in the shop's system data below (stock, a "
    "product's price, the delivery cost to a wilaya) -> needs_tool=true, tool_name=that intent. "
    "Never answer it from memory.\n"
    "- Needs an action NOT covered by any available intent -> needs_tool=true and set tool_name to a "
    "short proposed intent name (e.g. 'warrantyClaim', 'refundRequest') so it can be escalated.\n"
)

_MEMORY = (
    "\n\nCurrent conversation context (use this to answer questions about existing "
    "orders, products, shipping, etc.):\n"
)


BACKEND = (
    "\n\nWhat the shop's system knows right now about this customer (their current order, "
    "product and details; it may come from the online store, not from this chat). Use it to "
    "answer questions about them:\n"
)


def check_system(
    tool_descriptions: dict[str, str], schema_hint: str, memory_hint: str, backend_hint: str = "",
) -> str:
    system = (
        "You are the intent classifier of an e-commerce assistant. Available intents:\n"
        + tool_list(tool_descriptions)
        + _RULES
        + schema_hint
    )
    if memory_hint:
        system += _MEMORY + memory_hint
    if backend_hint:
        system += BACKEND + backend_hint
    return system
