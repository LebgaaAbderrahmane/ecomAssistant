"""The test conversations. Each case: customer turns in, expected result out. Only the last turn is scored."""
from langsmith import Client

DATASET_NAME = "ecom-agent-v1"

BUY_TURNS = ["3andkom Nike Air Max?", "nheb nchriha"]

CASES = [
    {"case": 1, "turns": ["salam"], "outcome": "reply", "expected_tools": []},
    {"case": 2, "turns": ["3andkom Nike Air Max?"], "outcome": "reply", "expected_tools": ["searchProducts"]},
    {"case": 3, "turns": ["3andkom iPhone 15?"], "outcome": "reply", "expected_tools": ["searchProducts"]},
    {
        "case": 4, "turns": ["chhal livraison l Oran?"], "outcome": "reply",
        "expected_tools": ["calculateShipping"], "expected_args": {"wilaya": "oran"},
    },
    {
        "case": 5, "turns": ["Bonjour, vous avez des montres ?"], "outcome": "reply",
        "expected_tools": ["searchProducts", "suggestProducts"],
    },
    {"case": 6, "turns": BUY_TURNS, "outcome": "ask_info", "expected_tools": []},
    {
        "case": 7, "turns": [*BUY_TURNS, "Oran, Bir El Djir, wa7da"], "outcome": "reply",
        "expected_tools": ["createOrder"],
        "expected_args": {"productId": "p1", "wilaya": "oran", "commune": "bir el djir", "quantity": 1},
    },
    {
        "case": 8, "turns": ["nheb refund, la montre khasra"], "outcome": "escalate",
        "expected_tools": ["escalateConversation"],
    },
    {
        # Stale reply bug: after a normal turn 1, an escalation on turn 2 must not resend turn 1's reply.
        "case": 9, "turns": ["salam", "je veux un remboursement"], "outcome": "escalate",
        "expected_tools": ["escalateConversation"],
    },
    {
        # Expected to fail today: orderId is a required arg, so the agent asks the customer for it
        # instead of letting back fill it from conversation.currentOrderId.
        "case": 10, "turns": ["oui je confirme ma commande"], "outcome": "reply",
        "expected_tools": ["confirmOrder"],
    },
]


def _example(case: dict) -> dict:
    return {
        "inputs": {"turns": case["turns"]},
        "outputs": {
            "outcome": case["outcome"],
            "expected_tools": case["expected_tools"],
            "expected_args": case.get("expected_args", {}),
        },
        "metadata": {"case": case["case"]},
    }


def ensure_dataset(client: Client) -> None:
    """Create the dataset once. To change cases, bump DATASET_NAME so old experiments stay comparable."""
    if client.has_dataset(dataset_name=DATASET_NAME):
        return
    dataset = client.create_dataset(DATASET_NAME, description="ecom_agent graph evals with fake tools")
    client.create_examples(dataset_id=dataset.id, examples=[_example(c) for c in CASES])
