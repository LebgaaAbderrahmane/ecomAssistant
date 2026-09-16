import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


class LLMUnavailableError(RuntimeError):
    """Raised when every configured LLM provider fails a call."""


class _BoundModel:
    """A tool-bound LLM view that fails over across all configured providers."""

    def __init__(self, binds: list[tuple[str, Any]]):
        self._binds = binds

    def invoke(self, messages: list[Any]) -> Any:
        errors = []
        for name, model in self._binds:
            try:
                return model.invoke(messages)
            except Exception as e:
                errors.append(f"{name}: {e}")
                logger.warning("LLM provider '%s' (tool-calling) failed: %s", name, e)
        raise LLMUnavailableError("all LLM providers failed: " + "; ".join(errors))

    def __getattr__(self, name: str) -> Any:
        if self._binds:
            return getattr(self._binds[0][1], name)
        raise LLMUnavailableError("no LLM providers configured")


class LLMClient:
    """Provider-aware LLM client.

    Holds an ordered list of (provider, chat model) pairs from .add_provider().
    ``invoke()`` tries them in priority order and moves to the next provider
    when a call fails (rate limit, outage, 4xx/5xx); it only raises once every
    provider has failed, so callers can fall back (e.g. escalate to a human).
    ``bind_tools()`` returns a failover wrapper bound to the given tools, so
    the tool-calling path gets the same resilience as plain chat calls.
    """

    def __init__(self) -> None:
        self._models: list[tuple[str, Any]] = []

    def add_provider(self, name: str, model: Any) -> None:
        self._models.append((name, model))

    @property
    def configured(self) -> bool:
        return bool(self._models)

    @property
    def providers(self) -> list[str]:
        return [name for name, _ in self._models]

    @property
    def primary(self) -> str:
        return self._models[0][0] if self._models else ""

    def invoke(self, messages: list[Any]) -> Any:
        if not self._models:
            raise LLMUnavailableError("no LLM providers configured")
        errors = []
        for name, model in self._models:
            try:
                return model.invoke(messages)
            except Exception as e:
                errors.append(f"{name}: {e}")
                logger.warning("LLM provider '%s' failed: %s", name, e)
        raise LLMUnavailableError("all LLM providers failed: " + "; ".join(errors))

    def bind_tools(self, tools: list[Any], **kwargs: Any) -> _BoundModel:
        if not self._models:
            raise LLMUnavailableError("no LLM providers configured")
        binds = [(name, model.bind_tools(tools, **kwargs)) for name, model in self._models]
        return _BoundModel(binds)


# ============================================================
# Provider factories
# ============================================================

def _build_gemini() -> Any:
    from langchain_google_genai import ChatGoogleGenerativeAI

    return ChatGoogleGenerativeAI(
        model=os.environ.get("GEMINI_MODEL", "gemini-2.5-flash"),
        temperature=0,
    )


def _build_groq() -> Any:
    from langchain_groq import ChatGroq

    return ChatGroq(
        model=os.environ.get("GROQ_MODEL", "openai/gpt-oss-120b"),
        temperature=0,
    )


_BUILDERS: dict[str, Any] = {
    "gemini": _build_gemini,
    "groq": _build_groq,
}

DEFAULT_PROVIDERS = "groq,gemini"


def build_client() -> LLMClient:
    raw = os.environ.get("LLM_PROVIDER", DEFAULT_PROVIDERS).strip().lower()
    order = [p.strip() for p in raw.split(",") if p.strip()] or [p.strip() for p in DEFAULT_PROVIDERS.split(",")]
    client = LLMClient()
    for name in order:
        builder = _BUILDERS.get(name)
        if builder is None:
            logger.warning("Unknown LLM provider '%s' in LLM_PROVIDER; skipping", name)
            continue
        try:
            client.add_provider(name, builder())
            logger.info("LLM provider '%s' configured", name)
        except Exception as e:
            logger.warning("LLM provider '%s' reported missing credentials (%s); skipping", name, e)
    if not client.configured:
        logger.error("No LLM providers configured (LLM_PROVIDER=%s). Agent cannot generate replies.", raw)
    return client