import json
import re as _re
import logging
from typing import Any

from langchain_core.messages import HumanMessage
from pydantic import BaseModel, ValidationError

from config import model

logger = logging.getLogger(__name__)

# ============================================================
# Regex constants
# ============================================================

_NUM_RE = _re.compile(r"\b\d+\b")
_AFFIRM_RE = _re.compile(
    r"\b(yes|yeah|yep|ok|okay|sure|fine|go|go ahead|do it|deal|let's go|lets go|nedi|ekhdem|zid|na'am|d'accord|aight)\b",
    _re.IGNORECASE,
)
_CANCEL_RE = _re.compile(
    r"\b(cancel|cancel it|forget|forget it|never mind|nevermind|nvm|stop|abort|leave it|drop it|"
    r"asba|khaleh|la|no thanks|not now|later)\b",
    _re.IGNORECASE,
)
_BUY_RE = _re.compile(
    r"\b(buy|order|take|get|want|grab|nedi|khoud|ekhdem|prefer)\b",
    _re.IGNORECASE,
)
_STOP_WORDS = {
    "the", "this", "that", "your", "please", "actually", "will", "would", "could",
    "with", "and", "for", "you", "i", "me", "just", "want",
}


# ============================================================
# Message / text helpers
# ============================================================

def content_text(raw: Any) -> str:
    content = getattr(raw, "content", "")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for c in content:
            if isinstance(c, dict):
                parts.append(c.get("text", "") if c.get("type") == "text" else json.dumps(c))
            else:
                parts.append(str(c))
        return "".join(parts)
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
            if mtype == "human":
                role = "customer"
            elif mtype == "ai":
                role = "assistant"
            elif mtype == "tool":
                role = "tool"
            else:
                role = mtype or "?"
            text = getattr(m, "content", "") or ""
        if isinstance(text, list):
            parts = []
            for c in text:
                if isinstance(c, dict):
                    parts.append(c.get("text", "") if c.get("type") == "text" else json.dumps(c))
                else:
                    parts.append(str(c))
            text = " ".join(parts)
        items.append({"role": role, "text": str(text)[:300]})
    items.reverse()
    return items


# ============================================================
# JSON parsing helpers
# ============================================================

def extract_json_span(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    start = text.find("{")
    if start == -1:
        return text
    depth = 0
    in_str = False
    escape = False
    for i in range(start, len(text)):
        ch = text[i]
        if in_str:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return text[start : i + 1]
    return text[start:]


def parse_json_dict(text: str) -> dict[str, Any] | None:
    candidates = [text, extract_json_span(text)]
    try:
        d = json.loads(text)
        if isinstance(d, dict) and "name" in d and "arguments" in d:
            args = d["arguments"]
            if isinstance(args, str):
                args = json.loads(args)
            candidates.append(json.dumps(args))
    except (json.JSONDecodeError, TypeError):
        pass
    seen: set[str] = set()
    for cand in candidates:
        if cand in seen:
            continue
        seen.add(cand)
        try:
            obj = json.loads(cand)
            if isinstance(obj, dict):
                return obj
        except json.JSONDecodeError:
            continue
    return None


def parse_json_obj(text: str, schema: type[BaseModel]) -> BaseModel | None:
    obj = parse_json_dict(text)
    if obj is None:
        return None
    try:
        return schema(**obj)
    except (ValidationError, TypeError):
        return None


def call_json(model, schema: type[BaseModel], fallback: BaseModel, messages: list) -> BaseModel:
    retry_msg = HumanMessage(
        content="That was not valid JSON output. Reply with ONLY the raw JSON object matching the "
        "schema, with no prose and no name/arguments wrapper."
    )
    for messages_ in (messages, [*messages, retry_msg]):
        try:
            raw = model.invoke(messages_)
        except Exception as e:
            logger.warning("structured call failed (%s)", e)
            continue
        parsed = parse_json_obj(content_text(raw), schema)
        if parsed is not None:
            return parsed
        logger.warning("structured response did not parse: %s", content_text(raw)[:200])
    return fallback


def struct_schema_hint(schema: type[BaseModel]) -> str:
    return (
        "Respond with a single valid JSON object ONLY, with no prose, markdown, or extra text. "
        "Never use an OpenAI function call format (do not wrap the object in {\"name\": ..., "
        "\"arguments\": ...}). Output the raw JSON object directly.\n"
        "The JSON must conform exactly to this JSON schema:\n"
        + json.dumps(schema.model_json_schema())
    )


# ============================================================
# LLM phrase helper
# ============================================================

def llm_phrase(system: str, human: str) -> str:
    from langchain_core.messages import SystemMessage
    try:
        msg = model.invoke([SystemMessage(content=system), HumanMessage(content=human)])
        text = content_text(msg).strip()
        return text or "Could you provide some more information, please?"
    except Exception as e:
        logger.warning("reply phrasing call failed (%s)", e)
        return "Could you provide some more information, please?"
