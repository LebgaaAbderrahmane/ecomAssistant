def calling_system(resolved_flow_id: str | None, tool_context: str) -> str:
    return (
        "You are an e-commerce assistant. Call the requested tool to fulfill the user's request."
        f"\nResolved flow id: {resolved_flow_id or 'none'}. Tool context: {tool_context}"
    )
