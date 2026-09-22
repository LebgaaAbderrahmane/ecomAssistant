import logging

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel

from config import model
from prompts.common import ASK_MORE_INFO, JSON_RETRY
from text.json_parse import parse_json_dict, parse_json_obj
from text.messages import content_text

logger = logging.getLogger(__name__)


def call_json(model, schema: type[BaseModel], fallback: BaseModel, messages: list) -> BaseModel:
    """Ask for JSON matching `schema`, retry once, then return `fallback`."""
    retry_msg = HumanMessage(content=JSON_RETRY)
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


def ask_json_dict(system: str, human: str, fail_log: str) -> dict:
    """One call that returns a JSON dict, or {} on error or bad JSON."""
    try:
        msg = model.invoke([SystemMessage(content=system), HumanMessage(content=human)])
        return parse_json_dict(content_text(msg)) or {}
    except Exception as e:
        logger.warning(fail_log, e)
        return {}


def llm_phrase(system: str, human: str) -> str:
    try:
        msg = model.invoke([SystemMessage(content=system), HumanMessage(content=human)])
        text = content_text(msg).strip()
        return text or ASK_MORE_INFO
    except Exception as e:
        logger.warning("reply phrasing call failed (%s)", e)
        return ASK_MORE_INFO
