import json
import logging
from typing import Any

from langgraph.graph import StateGraph, START, END
from langgraph.checkpoint.memory import InMemorySaver
from langgraph.store.memory import InMemoryStore

from models.state import AgentState
from nodes.draft import draft_gate, extract_tool_args, ask_reply, after_extract
from nodes.check import check_llm
from nodes.query import query_tool
from nodes.flow import flow_resolver
from nodes.calling import calling_tool
from nodes.reply import reply, escalate
from nodes.memory import hydrate, persist
from routing import route, draft_route, query_escalate_route, flow_route

logger = logging.getLogger(__name__)


def _build_graph() -> StateGraph:
    graph = StateGraph(AgentState)
    graph.add_node("hydrate", hydrate)
    graph.add_node("draft_gate", draft_gate)
    graph.add_node("extract_tool_args", extract_tool_args)
    graph.add_node("ask_reply", ask_reply)
    graph.add_node("check_llm", check_llm)
    graph.add_node("query_tool", query_tool)
    graph.add_node("escalate", escalate)
    graph.add_node("flow_resolver", flow_resolver)
    graph.add_node("calling_tool", calling_tool)
    graph.add_node("reply", reply)
    graph.add_node("persist", persist)

    graph.add_edge(START, "hydrate")
    graph.add_edge("hydrate", "draft_gate")
    graph.add_conditional_edges(
        "draft_gate",
        draft_route,
        {"extract_tool_args": "extract_tool_args", "reply": "reply", "check_llm": "check_llm"},
    )
    graph.add_conditional_edges(
        "extract_tool_args",
        after_extract,
        {"calling_tool": "calling_tool", "ask_reply": "ask_reply"},
    )
    graph.add_edge("ask_reply", "reply")
    graph.add_conditional_edges("check_llm", route, {"query_tool": "query_tool", "reply": "reply"})
    graph.add_conditional_edges(
        "query_tool",
        query_escalate_route,
        {"escalate": "escalate", "flow_resolver": "flow_resolver"},
    )
    graph.add_edge("escalate", "persist")
    graph.add_conditional_edges(
        "flow_resolver",
        flow_route,
        {"calling_tool": "calling_tool", "reply": "reply", "extract_tool_args": "extract_tool_args"},
    )
    graph.add_edge("calling_tool", "reply")
    graph.add_edge("reply", "persist")
    graph.add_edge("persist", END)
    return graph


def _compile():
    store = InMemoryStore()
    g = _build_graph()
    return g.compile(checkpointer=InMemorySaver(), store=store)


app = _compile()


def to_serializable(value: Any) -> Any:
    from langchain_core.messages import message_to_dict
    if isinstance(value, list):
        return [to_serializable(m) for m in value]
    if hasattr(value, "type"):
        return message_to_dict(value)
    return value


def log_state(state: Any) -> None:
    data = state if isinstance(state, dict) else state.model_dump()
    payload = {k: to_serializable(v) for k, v in data.items()}
    logger.info("Final AgentState:\n%s", json.dumps(payload, indent=2, default=str))


def save_graph_png(path: str = "graph.png") -> str:
    try:
        with open(path, "wb") as f:
            f.write(app.get_graph().draw_mermaid_png())
        logger.info("Graph saved to %s", path)
        return path
    except Exception as e:
        logger.warning("PNG render failed (%s); falling back to mermaid source", e)
        try:
            with open("graph.mmd", "w") as f:
                f.write(app.get_graph().draw_mermaid())
            logger.info("Saved mermaid source to graph.mmd")
        except Exception as e2:
            logger.warning("mermaid source write failed (%s)", e2)
        try:
            from rich import print as rprint
            rprint(app.get_graph().draw_ascii())
        except Exception as e3:
            logger.warning("ascii render unavailable (%s)", e3)
        return "graph.mmd"
