import json

from pydantic import BaseModel

JSON_RETRY = (
    "That was not valid JSON output. Reply with ONLY the raw JSON object matching the "
    "schema, with no prose and no name/arguments wrapper."
)

# Fixed texts sent to the customer when no LLM answer is available.
DEFAULT_REPLY = "I understood your request."
ASK_MORE_INFO = "Could you provide some more information, please?"
GREETING = "Bonjour, comment puis-je vous aider ?"


def struct_schema_hint(schema: type[BaseModel]) -> str:
    return (
        "Respond with a single valid JSON object ONLY, with no prose, markdown, or extra text. "
        "Never use an OpenAI function call format (do not wrap the object in {\"name\": ..., "
        "\"arguments\": ...}). Output the raw JSON object directly.\n"
        "The JSON must conform exactly to this JSON schema:\n"
        + json.dumps(schema.model_json_schema())
    )


def tool_list(descriptions: dict[str, str]) -> str:
    return "\n".join(f"- {name}: {desc}" for name, desc in descriptions.items())
