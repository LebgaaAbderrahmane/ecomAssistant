"""A retried message must not run twice, and two Turns of one Conversation must not run together.

The lock tests run twice: with the in-process lock, and with the Postgres lock when TEST_DATABASE_URL is set.
The Postgres lock only calls pg_advisory_lock. It creates no table.
"""
import os
import threading
import time

import pytest
from langgraph.store.memory import InMemoryStore

from turn_guard import TurnBusy, TurnGuard, TurnResult

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
WAIT = 5


@pytest.fixture(params=["process", pytest.param("postgres", marks=pytest.mark.skipif(not TEST_DATABASE_URL, reason="TEST_DATABASE_URL is not set"))])
def make_guard(request):
    def make(lock_timeout: float = WAIT) -> TurnGuard:
        url = TEST_DATABASE_URL if request.param == "postgres" else None
        return TurnGuard(InMemoryStore(), database_url=url, lock_timeout=lock_timeout)

    return make


def start(guard: TurnGuard, conversation_id: str, message_id: str, run):
    """Run a Turn in a thread. The result (or the error) lands in the box."""
    box: dict = {}

    def target() -> None:
        try:
            box["result"] = guard.run_once(conversation_id, message_id, run)
        except Exception as exc:
            box["error"] = exc

    thread = threading.Thread(target=target)
    thread.start()
    return thread, box


def test_a_retried_message_gets_the_saved_result_and_runs_once():
    guard = TurnGuard(InMemoryStore())
    calls = []

    def run() -> TurnResult:
        calls.append(1)
        return TurnResult(escalate=False, text="Your order is made")

    first = guard.run_once("c1", "m1", run)
    second = guard.run_once("c1", "m1", run)

    assert first == second == TurnResult(escalate=False, text="Your order is made")
    assert len(calls) == 1


def test_a_saved_escalation_is_returned_as_it_is():
    guard = TurnGuard(InMemoryStore())
    guard.run_once("c1", "m1", lambda: TurnResult(escalate=True))

    again = guard.run_once("c1", "m1", lambda: pytest.fail("the Turn must not run again"))

    assert again == TurnResult(escalate=True, text="")


def test_other_messages_run_their_own_turn():
    guard = TurnGuard(InMemoryStore())
    guard.run_once("c1", "m1", lambda: TurnResult(False, "one"))

    second = guard.run_once("c1", "m2", lambda: TurnResult(False, "two"))

    assert second.text == "two"


def test_the_same_message_id_in_another_conversation_is_not_a_retry():
    guard = TurnGuard(InMemoryStore())
    guard.run_once("c1", "m1", lambda: TurnResult(False, "one"))

    other = guard.run_once("c2", "m1", lambda: TurnResult(False, "two"))

    assert other.text == "two"


def test_a_failed_turn_saves_nothing_and_a_retry_runs_it_again():
    guard = TurnGuard(InMemoryStore())

    def broken() -> TurnResult:
        raise RuntimeError("the agent crashed")

    with pytest.raises(RuntimeError):
        guard.run_once("c1", "m1", broken)

    again = guard.run_once("c1", "m1", lambda: TurnResult(False, "ok"))
    assert again.text == "ok"


def test_the_second_turn_of_a_conversation_waits_for_the_first(make_guard):
    guard = make_guard()
    events = []
    first_started = threading.Event()
    release_first = threading.Event()

    def first() -> TurnResult:
        events.append("first start")
        first_started.set()
        assert release_first.wait(WAIT)
        events.append("first end")
        return TurnResult(False, "a")

    def second() -> TurnResult:
        events.append("second start")
        return TurnResult(False, "b")

    t1, _ = start(guard, "c1", "m1", first)
    assert first_started.wait(WAIT)
    t2, _ = start(guard, "c1", "m2", second)
    time.sleep(0.3)
    assert events == ["first start"]

    release_first.set()
    t1.join(WAIT)
    t2.join(WAIT)
    assert events == ["first start", "first end", "second start"]


def test_a_retry_that_comes_while_the_first_try_runs_gets_the_first_result(make_guard):
    guard = make_guard()
    calls = []
    started = threading.Event()
    release = threading.Event()

    def slow() -> TurnResult:
        calls.append("run")
        started.set()
        assert release.wait(WAIT)
        return TurnResult(False, "Your order is made")

    def must_not_run() -> TurnResult:
        calls.append("run again")
        return TurnResult(False, "a second order")

    t1, box1 = start(guard, "c1", "m1", slow)
    assert started.wait(WAIT)
    t2, box2 = start(guard, "c1", "m1", must_not_run)
    time.sleep(0.3)

    release.set()
    t1.join(WAIT)
    t2.join(WAIT)
    assert calls == ["run"]
    assert box1["result"] == box2["result"] == TurnResult(False, "Your order is made")


def test_a_turn_gives_up_when_the_lock_is_not_free_in_time(make_guard):
    guard = make_guard(lock_timeout=0.3)
    started = threading.Event()
    release = threading.Event()

    def slow() -> TurnResult:
        started.set()
        assert release.wait(WAIT)
        return TurnResult(False, "a")

    t1, _ = start(guard, "c1", "m1", slow)
    assert started.wait(WAIT)

    with pytest.raises(TurnBusy):
        guard.run_once("c1", "m2", lambda: pytest.fail("the Turn must not run"))

    release.set()
    t1.join(WAIT)


def test_conversations_do_not_wait_for_each_other(make_guard):
    guard = make_guard(lock_timeout=0.3)
    started = threading.Event()
    release = threading.Event()

    def slow() -> TurnResult:
        started.set()
        assert release.wait(WAIT)
        return TurnResult(False, "a")

    t1, _ = start(guard, "c1", "m1", slow)
    assert started.wait(WAIT)

    other = guard.run_once("c2", "m1", lambda: TurnResult(False, "b"))

    assert other.text == "b"
    release.set()
    t1.join(WAIT)


def test_the_lock_is_free_again_after_a_failed_turn(make_guard):
    guard = make_guard(lock_timeout=0.5)

    def broken() -> TurnResult:
        raise RuntimeError("boom")

    with pytest.raises(RuntimeError):
        guard.run_once("c1", "m1", broken)

    assert guard.run_once("c1", "m2", lambda: TurnResult(False, "ok")).text == "ok"
