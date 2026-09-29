import logging
from pathlib import Path

from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(_PROJECT_ROOT / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_model = None


def get_model():
    """Build the failover LLM client once. Order comes from LLM_PROVIDER."""
    global _model
    if _model is None:
        from llm import build_client

        _model = build_client()
    return _model


class _ModelProxy:
    def __getattr__(self, name):
        return getattr(get_model(), name)


model = _ModelProxy()