"""The test conversations. Each case: customer turns in, expected result out. Only the last turn is scored."""
from langsmith import Client

DATASET_NAME = "ecom-agent-v2"

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
        "case": 7, "turns": [*BUY_TURNS, "Oran, Bir El Djir, wa7da, Cité 200 logements"], "outcome": "reply",
        "expected_tools": ["createOrder"],
        "expected_args": {
            "productId": "p1", "wilaya": "oran", "commune": "bir el djir", "quantity": 1,
            "address": "cité 200 logements",
        },
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
        # No orderId from the customer: back fills it from conversation.currentOrderId.
        "case": 10, "turns": ["oui je confirme ma commande"], "outcome": "reply",
        "expected_tools": ["confirmOrder"],
    },
    {
        # The customer answers piece by piece; the order draft must remember every piece.
        "case": 11, "turns": [*BUY_TURNS, "Oran", "Bir El Djir", "wa7da", "Cité 200 logements"],
        "outcome": "reply", "expected_tools": ["createOrder"],
        "expected_args": {
            "productId": "p1", "wilaya": "oran", "commune": "bir el djir", "quantity": 1,
            "address": "cité 200 logements",
        },
    },
    {"case": 12, "turns": ["nheb nlghi la commande"], "outcome": "reply", "expected_tools": ["cancelOrder"]},
    {
        "case": 13, "turns": ["bedel la quantité l 2"], "outcome": "reply",
        "expected_tools": ["modifyOrder"], "expected_args": {"quantity": 2},
    },
    {
        # Order status changes over time, so it must come from the tool, not from memory.
        "case": 14, "turns": ["win rahi la commande dyali?"], "outcome": "reply",
        "expected_tools": ["getOrderStatus"],
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
