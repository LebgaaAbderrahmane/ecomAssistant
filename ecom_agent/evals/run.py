"""Run the agent evals. From ecom_agent/: python -m evals.run [--cases 6,7,9] [--pause 30]"""
import argparse
import logging
import os

import config  # noqa: F401  loads ecom_agent/.env before the LangSmith client reads the key
from langsmith import Client

from evals import fake_tools, target
from evals.dataset import DATASET_NAME, ensure_dataset
from evals.evaluators import EVALUATORS

logger = logging.getLogger(__name__)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run ecom_agent evals on LangSmith.")
    parser.add_argument("--cases", help="only these case numbers, e.g. 6,7,9")
    parser.add_argument(
        "--pause", type=float, default=30.0,
        help="seconds to wait before each turn; one turn is about 3.4K tokens and Groq free tier allows 8K per minute",
    )
    args = parser.parse_args()

    fake_tools.install()
    target.PAUSE_SECONDS = args.pause
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
