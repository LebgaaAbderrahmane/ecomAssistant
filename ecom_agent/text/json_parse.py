import json
from typing import Any

from pydantic import BaseModel, ValidationError


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
    # Some models wrap the object in an OpenAI-style {"name", "arguments"} call.
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
