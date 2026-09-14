import logging
import os
from pathlib import Path

from dotenv import load_dotenv

_PROJECT_ROOT = Path(__file__).resolve().parent
load_dotenv(_PROJECT_ROOT / ".env")

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

_model = None
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.5-flash")


def get_model():
    global _model
    if _model is None:
        from langchain_google_genai import ChatGoogleGenerativeAI
        _model = ChatGoogleGenerativeAI(
            model=GEMINI_MODEL,
            temperature=0,
        )
    return _model


class _ModelProxy:
    def __getattr__(self, name):
        return getattr(get_model(), name)


model = _ModelProxy()
