"""Code-only checks. Each one gets what happened and what we expected, and returns 1 (pass) or 0 (fail)."""


def _norm(value: object) -> str:
    return str(value).strip().lower()


def correct_outcome(outputs: dict, reference_outputs: dict) -> dict:
    got, want = outputs["outcome"], reference_outputs["outcome"]
    return {"key": "correct_outcome", "score": int(got == want), "comment": f"got {got}, want {want}"}


def correct_tool(outputs: dict, reference_outputs: dict) -> dict:
    called = [c["name"] for c in outputs["tools_called"]]
    expected = reference_outputs["expected_tools"]
    ok = not called if not expected else any(name in expected for name in called)
    return {"key": "correct_tool", "score": int(ok), "comment": f"called {called}, want one of {expected}"}


def correct_args(outputs: dict, reference_outputs: dict) -> dict:
    expected_args = reference_outputs.get("expected_args") or {}
    if not expected_args:
        return {"key": "correct_args", "score": None, "comment": "no expected args for this case"}
    call = next(
        (c for c in outputs["tools_called"] if c["name"] in reference_outputs["expected_tools"]), None
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


def llm_clean(outputs: dict, reference_outputs: dict) -> dict:
    failures = outputs["llm_failures"]
    return {"key": "llm_clean", "score": int(failures == 0), "comment": f"{failures} LLM provider failures"}


EVALUATORS = [correct_outcome, correct_tool, correct_args, server_sends_right_thing, llm_clean]
