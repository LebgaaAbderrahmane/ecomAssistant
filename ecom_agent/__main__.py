from graph import app, save_graph_png

from rich import print


def main():
    save_graph_png()
    config = {"configurable": {"thread_id": "1"}}

    while True:
        user_input = input("You: ")
        if user_input.strip().lower() in {"exit", "quit"}:
            break
        if not user_input.strip():
            continue

        result = app.invoke(
            {"messages": [{"role": "user", "content": user_input}]},
            config=config,
        )
        print("The graph state: ", result)
        state = result.model_dump() if hasattr(result, "model_dump") else result
        if isinstance(state["messages"][-1], str):
            reply_text = state["messages"][-1]
        else:
            last = state["messages"][-1]
            reply_text = last.content if hasattr(last, "content") else last.get("content", last)
        print("Assistant:", reply_text)


if __name__ == "__main__":
    main()
