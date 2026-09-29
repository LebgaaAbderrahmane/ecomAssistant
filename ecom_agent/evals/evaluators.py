"""Code-only checks. Each one gets what happened and what we expected, and returns 1 (pass) or 0 (fail)."""


def _norm(value: object) -> str:
    return str(value).strip().lower()


def correct_outcome(outputs: dict, reference_outputs: dict) -> dict:
    got, want = outputs["outcome"], reference_outputs["outcome"]
    return {"key": "correct_outcome", "score": int(got == want), "comment": f"got {got}, want {want}"}


def correct_tool(outputs: dict, reference_outputs: dict) -> dict:
    called = [c["name"] for c in outputs["tools_called"]]
    expected = reference_outputs.get("expected_tools")
    if expected is None:
        return {"key": "correct_tool", "score": None, "comment": f"any tool is fine; called {called}"}
    ok = not called if not expected else any(name in expected for name in called)
    return {"key": "correct_tool", "score": int(ok), "comment": f"called {called}, want one of {expected}"}


def correct_args(outputs: dict, reference_outputs: dict) -> dict:
    expected_args = reference_outputs.get("expected_args") or {}
    if not expected_args:
        return {"key": "correct_args", "score": None, "comment": "no expected args for this case"}
    call = next(
        (c for c in outputs["tools_called"] if c["name"] in (reference_outputs.get("expected_tools") or [])),
        None,
    )
    if call is None:
        return {"key": "correct_args", "score": 0, "comment": "expected tool was not called"}
    wrong = {k: call["args"].get(k) for k, v in expected_args.items() if _norm(call["args"].get(k)) != _norm(v)}
    return {"key": "correct_args", "score": int(not wrong), "comment": f"wrong args: {wrong}" if wrong else "ok"}


def server_sends_right_thing(outputs: dict, reference_outputs: dict) -> dict:
    sends_text = bool(outputs["server_reply"].strip())
    should_escalate = reference_outputs["outcome"] == "escalate"
    ok = sends_text != should_escalate
    return {
        "key": "server_sends_right_thing",
        "score": int(ok),
        "comment": f"server would send: {outputs['server_reply'][:120]!r}",
    }


def _squash(text: str) -> str:
    # "12 600", "12,600" and "12600" all become "12600".
    return "".join(ch for ch in text.lower() if ch not in " ,.  ")


def reply_mentions(outputs: dict, reference_outputs: dict) -> dict:
    """Each item must appear in the reply. "a|b" means a or b (e.g. the same word in two languages)."""
    items = reference_outputs.get("reply_mentions") or []
    if not items:
        return {"key": "reply_mentions", "score": None, "comment": "nothing to check for this case"}
    reply = _squash(outputs["reply"])
    missing = [item for item in items if not any(_squash(alt) in reply for alt in item.split("|"))]
    return {"key": "reply_mentions", "score": int(not missing), "comment": f"missing: {missing}" if missing else "ok"}


def llm_clean(outputs: dict, reference_outputs: dict) -> dict:
    failures = outputs["llm_failures"]
    return {"key": "llm_clean", "score": int(failures == 0), "comment": f"{failures} LLM provider failures"}


EVALUATORS = [correct_outcome, correct_tool, correct_args, server_sends_right_thing, reply_mentions, llm_clean]
