"""Make a Turn safe to retry.

back sends the same message again when a call fails. This module makes sure that:
- only one Turn runs at a time for one Conversation, and
- a message that was already handled gets its first result, not a second run.
"""
import logging
import threading
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import psycopg
from psycopg import errors

log = logging.getLogger("ecom_agent.turn_guard")

# Saved results sit in the agent store, in their own namespace next to the Conversation notes.
RESULTS = "turns"
LOCK_PREFIX = "ecom_agent:turn:"


class TurnBusy(RuntimeError):
    """Another Turn of this Conversation did not finish in time."""


@dataclass(frozen=True)
class TurnResult:
    escalate: bool
    text: str = ""


class TurnGuard:
    def __init__(self, store, database_url: str | None = None, lock_timeout: float = 60.0) -> None:
        self._store = store
        self._database_url = database_url
        self._lock_timeout = lock_timeout
        # Without a database (bare mode, evals) the lock lives in this process. One lock per Conversation, never removed.
        self._local_locks: dict[str, threading.Lock] = {}
        self._local_locks_guard = threading.Lock()

    def run_once(self, conversation_id: str, message_id: str, run: Callable[[], TurnResult]) -> TurnResult:
        """Run the Turn, or return the saved result when this message was already handled.

        Raises TurnBusy when the lock is not free in time.
        """
        with self._hold(conversation_id):
            # Look after the lock is ours: a Turn that held it may have just saved this message.
            saved = self._load(conversation_id, message_id)
            if saved is not None:
                log.info("message %s was already handled, returning the saved result", message_id)
                return saved
            result = run()
            self._save(conversation_id, message_id, result)
            return result

    @contextmanager
    def _hold(self, conversation_id: str) -> Iterator[None]:
        if self._database_url:
            with self._hold_in_postgres(conversation_id):
                yield
        else:
            with self._hold_in_process(conversation_id):
                yield

    @contextmanager
    def _hold_in_postgres(self, conversation_id: str) -> Iterator[None]:
        # A session lock lasts as long as this connection. If the agent dies, Postgres frees it.
        conn = psycopg.connect(self._database_url, autocommit=True)
        try:
            wait_ms = max(1, int(self._lock_timeout * 1000))
            conn.execute("SELECT set_config('lock_timeout', %s, false)", (f"{wait_ms}ms",))
            try:
                # Postgres makes the number from the text. Python's hash() differs between processes.
                conn.execute("SELECT pg_advisnexory_lock(hashtextextended(%s, 0))", (LOCK_PREFIX + conversation_id,))
            except errors.LockNotAvailable as exc:
                raise TurnBusy(f"conversation {conversation_id} is busy") from exc
            yield
        finally:
            conn.close()

    @contextmanager
    def _hold_in_process(self, conversation_id: str) -> Iterator[None]:
        with self._local_locks_guard:
            lock = self._local_locks.setdefault(conversation_id, threading.Lock())
        if not lock.acquire(timeout=self._lock_timeout):
            raise TurnBusy(f"conversation {conversation_id} is busy")
        try:
            yield
        finally:
            lock.release()

    def _load(self, conversation_id: str, message_id: str) -> TurnResult | None:
        item = self._store.get((RESULTS, conversation_id), message_id)
        if item is None:
            return None
        return TurnResult(escalate=bool(item.value["escalate"]), text=item.value.get("text", ""))

    def _save(self, conversation_id: str, message_id: str, result: TurnResult) -> None:
        self._store.put(
            (RESULTS, conversation_id),
            message_id,
            {"escalate": result.escalate, "text": result.text},
        )
