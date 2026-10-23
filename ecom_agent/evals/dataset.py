"""The test conversations. Each case: customer turns in, expected result out. Only the last turn is scored."""
from langsmith import Client

DATASET_NAME = "ecom-agent-v4"

BUY_TURNS = ["3andkom Nike Air Max?", "nheb nchriha"]
# The order came from Shopify: back sent this template, the agent never wrote it.
CONFIRM_TEMPLATE = "Salam! Merci pour votre commande. Vous confirmez ? Répondez oui ou non."
SHOPIFY_ORDER = {"has_order": True, "messages": [CONFIRM_TEMPLATE]}

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
        "case": 10, "backend": SHOPIFY_ORDER, "turns": ["oui je confirme ma commande"], "outcome": "reply",
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
    {
        "case": 12, "backend": SHOPIFY_ORDER, "turns": ["nheb nlghi la commande"], "outcome": "reply",
        "expected_tools": ["cancelOrder"],
    },
    {
        "case": 13, "backend": SHOPIFY_ORDER, "turns": ["bedel la quantité l 2"], "outcome": "reply",
        "expected_tools": ["modifyOrder"], "expected_args": {"quantity": 2},
    },
    {
        # Order status changes over time, so it must come from the tool, not from memory.
        "case": 14, "backend": SHOPIFY_ORDER, "turns": ["win rahi la commande dyali?"], "outcome": "reply",
        "expected_tools": ["getOrderStatus"],
    },
    # The answers below are only in back's data (the order, or a merchant message), never in the
    # agent's own memory. Any tool is fine; the reply must carry the right fact.
    {
        "case": 15, "backend": SHOPIFY_ORDER, "turns": ["chhal total?"], "outcome": "reply",
        "expected_tools": None, "reply_mentions": ["12600"],
    },
    {
        "case": 16, "backend": SHOPIFY_ORDER, "turns": ["wach commandit?"], "outcome": "reply",
        "expected_tools": None, "reply_mentions": ["nike air max"],
    },
    {
        "case": 17,
        "backend": {"has_order": True, "messages": [
            CONFIRM_TEMPLATE,
            {"sender": "customer", "text": "wa9tach twasel?"},
            {"sender": "merchant", "text": "twasel nhar el khamis inchallah"},
        ]},
        "turns": ["sm7li, wa9tach goultli twasel?"], "outcome": "reply",
        "expected_tools": None, "reply_mentions": ["khamis|khmis|jeudi|thursday|الخميس"],
    },
    # Order-flow bugs found in the real end-to-end test of 2026-10-19.
    {
        # French "la" (the article) must not cancel the open order. A cancel would end the Draft: outcome "reply".
        "case": 18, "turns": [*BUY_TURNS, "je la veux livrer à Oran"], "outcome": "ask_info",
        "expected_tools": [],
    },
    {
        # The 200 in the street is not the quantity.
        "case": 19, "turns": [*BUY_TURNS, "Oran, Bir El Djir, 2 pièces, Cité 200 logements"], "outcome": "reply",
        "expected_tools": ["createOrder"],
        "expected_args": {"productId": "p1", "quantity": 2, "wilaya": "oran", "commune": "bir el djir"},
        "expected_address": {"address": "cité 200 logements"},
    },
    {
        # One place name is the wilaya. The commune must still be asked.
        "case": 20, "turns": [*BUY_TURNS, "Oran"], "outcome": "ask_info", "expected_tools": [],
        "expected_address": {"wilaya": "oran", "commune": None},
    },
    {
        # The fake shop refuses the commune "Oran". The customer fixes only the commune: the street stays.
        "case": 21, "turns": [*BUY_TURNS, "2 pièces, Oran, Oran, Cité 200 logements", "Bir El Djir"],
        "outcome": "reply", "expected_tools": ["createOrder"],
        "expected_args": {"quantity": 2, "wilaya": "oran", "commune": "bir el djir", "address": "cité 200 logements"},
    },
    {
        # The customer picks a product from the list by name, in one message with the whole order.
        "case": 22,
        "turns": [
            "vous avez des nike ou des montres ?",
            "je veux la Montre Casio, 1 pièce, Oran, Bir El Djir, Cité 200 logements",
        ],
        "outcome": "reply", "expected_tools": ["createOrder"],
        "expected_args": {
            "productId": "p2", "quantity": 1, "wilaya": "oran", "commune": "bir el djir",
            "address": "cité 200 logements",
        },
    },
    {
        # Second order, same wilaya, new commune: the saved street is wrong, so it is asked again.
        "case": 23,
        "turns": [
            *BUY_TURNS, "Oran, Bir El Djir, wa7da, Cité 200 logements", "nheb nchri Nike Air Max khra, wa7da, Oran, Es Senia",
        ],
        "outcome": "ask_info", "expected_tools": [],
        "expected_address": {"commune": "es senia", "address": None},
    },
]


def _example(case: dict) -> dict:
    return {
        "inputs": {"turns": case["turns"], "backend": case.get("backend", {})},
        "outputs": {
            "outcome": case["outcome"],
            "expected_tools": case["expected_tools"],
            "expected_args": case.get("expected_args", {}),
            "expected_address": case.get("expected_address", {}),
            "reply_mentions": case.get("reply_mentions", []),
        },
        "metadata": {"case": case["case"]},
    }


def ensure_dataset(client: Client) -> None:
    """Create the dataset once. To change cases, bump DATASET_NAME so old experiments stay comparable."""
    if client.has_dataset(dataset_name=DATASET_NAME):
        return
    dataset = client.create_dataset(DATASET_NAME, description="ecom_agent graph evals with fake tools")
    client.create_examples(dataset_id=dataset.id, examples=[_example(c) for c in CASES])
