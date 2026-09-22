import logging
from typing import Any

from tools import tool_for

logger = logging.getLogger(__name__)

SCHEMA_CACHE: dict[str, tuple[list[str], dict[str, Any]]] = {}


def tool_schema_info(tool_name: str) -> tuple[list[str], dict[str, Any]]:
    """Required field names and properties of a tool's args schema."""
    if tool_name in SCHEMA_CACHE:
        return SCHEMA_CACHE[tool_name]
    required: list[str] = []
    props: dict[str, Any] = {}
    try:
        t = tool_for(tool_name)
        schema = t.args_schema.model_json_schema()
        required = list(schema.get("required", []))
        props = schema.get("properties", {})
    except Exception as e:
        logger.warning("Could not introspect schema for %s: %s", tool_name, e)
    SCHEMA_CACHE[tool_name] = (required, props)
    return required, props


def coerce_args(raw: dict[str, Any], tool_name: str) -> dict[str, Any]:
    """Keep only known fields and cast them to the schema types. Bad values are dropped."""
    _, props = tool_schema_info(tool_name)
    out: dict[str, Any] = {}
    for k, v in raw.items():
        if k not in props or v is None or v == "":
            continue
        t = props[k].get("type")
        try:
            if t == "integer":
                out[k] = int(float(v))
            elif t == "number":
                out[k] = float(v)
            elif t == "boolean":
                if isinstance(v, bool):
                    out[k] = v
                elif str(v).lower() in ("true", "1"):
                    out[k] = True
                elif str(v).lower() in ("false", "0"):
                    out[k] = False
                else:
                    continue
            else:
                out[k] = str(v).strip()
        except (ValueError, TypeError):
            continue
    return out


def missing_fields(args: dict[str, Any], tool_name: str) -> list[str]:
    required, _ = tool_schema_info(tool_name)
    return [f for f in required if args.get(f) is None or args.get(f) == ""]
