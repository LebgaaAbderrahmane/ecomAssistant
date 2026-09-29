from prompts.common import tool_list

_RULES = (
    "\nRules:\n"
    "- Read `recent_conversation` before deciding. The user's latest message often answers an "
    "earlier question or continues an earlier subject - use that history to infer the true intent "
    "of the latest message.\n"
    "- When the user wants to BUY or ORDER a product that is already selected or visible in the "
    "conversation, choose createOrder and set quantity accordingly.\n"
    "- If a product is selected in `flows_with_selected_product` and the user refers to it, choose "
    "createOrder even if it is not the currently active flow.\n"
    "- Choose the tool even if some of its arguments are missing: the system asks the customer for "
    "missing details by itself. Never propose a new tool just to collect information (quantity, "
    "wilaya, commune, address, order id).\n"
    "- Never invent tools: if `requested_tool` is not in the list above, ignore it and remap the "
    "request to the correct tool from the list.\n"
    "- If the request needs an intent that NONE of the available tools supports, set "
    "`proposed_new_tool` to the missing intent/tool name (e.g. 'warrantyClaim', 'refundRequest') "
    "and leave `tool` as null. This triggers a human escalation and no tool is run.\n"
    "- Only choose escalateConversation if no other tool fits.\n"
)


def query_system(tool_descriptions: dict[str, str], schema_hint: str) -> str:
    return (
        "You pick the single best tool for the user's request. Available tools:\n"
        + tool_list(tool_descriptions)
        + _RULES
        + schema_hint
    )
