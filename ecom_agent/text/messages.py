import json
from typing import Any


def _join_parts(parts: list, sep: str) -> str:
    out = []
    for c in parts:
        if isinstance(c, dict):
            out.append(c.get("text", "") if c.get("type") == "text" else json.dumps(c))
        else:
            out.append(str(c))
    return sep.join(out)


def content_text(raw: Any) -> str:
    content = getattr(raw, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return _join_parts(content, "")
    return str(content or "")


def last_user_text(messages: list) -> str:
    for m in reversed(messages):
        if isinstance(m, str):
            return m
        if isinstance(m, dict) and m.get("role") == "user":
            text = m.get("content", "")
            return text if isinstance(text, str) else str(text)
        content = getattr(m, "content", "")
        if getattr(m, "type", "") == "human" and content:
            return content if isinstance(content, str) else str(content)
    return ""


_ROLES = {"human": "customer", "ai": "assistant", "tool": "tool"}


def recent_transcript(messages: list, n: int = 6) -> list[dict[str, str]]:
    items: list[dict[str, str]] = []
    for m in reversed(messages):
        if len(items) >= n:
            break
        if isinstance(m, dict):
            role = str(m.get("role", "?"))
            text = m.get("content", "")
        else:
            mtype = getattr(m, "type", "")
            role = _ROLES.get(mtype, mtype or "?")
            text = getattr(m, "content", "") or ""
        if isinstance(text, list):
            text = _join_parts(text, " ")
        items.append({"role": role, "text": str(text)[:300]})
    items.reverse()
    return items
