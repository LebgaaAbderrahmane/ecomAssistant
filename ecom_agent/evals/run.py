"""Run the agent evals. From ecom_agent/: python -m evals.run [--cases 6,7,9] [--pause 30] [--local]

--local scores the cases here and prints pass or fail per case. It sends nothing to LangSmith."""
import argparse
import logging
import os
import sys

# ecom_agent/.env may turn tracing on. This must be set before `import config` loads it.
if "--local" in sys.argv:
    for _name in ("LANGCHAIN_TRACING_V2", "LANGCHAIN_TRACING", "LANGSMITH_TRACING", "LANGSMITH_TRACING_V2"):
        os.environ[_name] = "false"

import config  # noqa: F401  loads ecom_agent/.env before the LangSmith client reads the key
from langsmith import Client

from evals import fake_backend, fake_tools, target
from evals.dataset import CASES, DATASET_NAME, _example, ensure_dataset
from evals.evaluators import EVALUATORS

logger = logging.getLogger(__name__)


def run_local(wanted: set[int] | None) -> int:
    """Returns 1 when a case failed, so a script can stop on it."""
    cases = [c for c in CASES if wanted is None or c["case"] in wanted]
    failed = 0
    for case in cases:
        example = _example(case)
        outputs = target.run_conversation(example["inputs"])
        bad = [s for s in (ev(outputs=outputs, reference_outputs=example["outputs"]) for ev in EVALUATORS) if s["score"] == 0]
        failed += bool(bad)
        print(f"case {case['case']:>2}  {'FAIL' if bad else 'ok'}  " + "; ".join(f"{s['key']}: {s['comment']}" for s in bad))
        print(f"         reply: {outputs['reply'][:120]!r}")
    print(f"{len(cases)} cases, {failed} failed")
    return int(bool(failed))


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ecom_agent evals on LangSmith.")
    parser.add_argument("--cases", help="only these case numbers, e.g. 6,7,9")
    parser.add_argument("--local", action="store_true", help="no LangSmith: print pass or fail per case")
    parser.add_argument(
        "--pause", type=float, default=30.0,
        help="seconds to wait before each turn; one turn is about 3.4K tokens and Groq free tier allows 8K per minute",
    )
    args = parser.parse_args()

    fake_tools.install()
    fake_backend.install()
    target.PAUSE_SECONDS = args.pause
    if args.local:
        sys.exit(run_local({int(n) for n in args.cases.split(",")} if args.cases else None))
    client = Client()
    ensure_dataset(client)

    examples = list(client.list_examples(dataset_name=DATASET_NAME))
    if args.cases:
        wanted = {int(n) for n in args.cases.split(",")}
        examples = [e for e in examples if e.metadata.get("case") in wanted]
    logger.info("running %d cases, pause=%ss", len(examples), args.pause)

    client.evaluate(
        target.run_conversation,
        data=examples,
        evaluators=EVALUATORS,
        experiment_prefix="agent",
        metadata={"llm_provider": os.environ.get("LLM_PROVIDER", ""), "pause": args.pause, "cases": args.cases or "all"},
        max_concurrency=0,
    )


if __name__ == "__main__":
    main()
