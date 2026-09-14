import logging
import os
from pathlib import Path

from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(_PROJECT_ROOT / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_model = None


def get_model():
    """Build and cache the provider-aware LLM client.

    Provider priority comes from the LLM_PROVIDER env var (comma-separated,
    default "groq,gemini"). Each provider is lazily constructed and the client
    fails over to the next provider when a call errors or is rate-limited.
    """
    global _model
    if _model is None:
        from llm import build_client

        _model = build_client()
    return _model


class _ModelProxy:
    def __getattr__(self, name):
        return getattr(get_model(), name)


model = _ModelProxy()