from prompts.common import tool_list

_RULES = (
    "\nDecide whether the customer's latest message needs a tool-backed action or can be answered "
    "directly:\n"
    "- Plain conversation or lightweight questions -> needs_tool=false, set reply.\n"
    "- Questions about existing data in the conversation context below (e.g. 'what did I order?', "
    "'what product was I looking at?', 'what's my shipping address?') -> needs_tool=false, set reply "
    "using the context. Never invent data; only use what is shown.\n"
    "- Needs an action covered by one of the available intents -> needs_tool=true, tool_name=that intent.\n"
    "- Needs an action NOT covered by any available intent -> needs_tool=true and set tool_name to a "
    "short proposed intent name (e.g. 'warrantyClaim', 'refundRequest') so it can be escalated.\n"
)

_MEMORY = (
    "\n\nCurrent conversation context (use this to answer questions about existing "
    "orders, products, shipping, etc.):\n"
)


def check_system(tool_descriptions: dict[str, str], schema_hint: str, memory_hint: str) -> str:
    system = (
        "You are the intent classifier of an e-commerce assistant. Available intents:\n"
        + tool_list(tool_descriptions)
        + _RULES
        + schema_hint
    )
    if memory_hint:
        system += _MEMORY + memory_hint
    return system
