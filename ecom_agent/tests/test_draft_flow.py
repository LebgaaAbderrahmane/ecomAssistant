"""How the Draft behaves, tested through the whole graph with a scripted LLM and the fake shop.

These tests describe what the agent does with a Draft. They were first run on the code before the Draft moved
into drafts.py, and they passed on both.
Each turn is checked on: the reply, the Draft in the notes, the saved address, and the exact LLM input.
"""
import json

import tools.registry
from flows import shown_products
from prompts.common import ASK_MORE_INFO


def _continue_flow(call):
    return {"action": "CONTINUE", "flow_id": call.payload()["active_flow_id"]}


def _llm_down(call):
    raise RuntimeError("LLM down")


def draft_of(turn):
    d = turn.draft
    if d is None:
        return None
    return {"tool": d.tool_name, "status": d.status, "args": d.args, "missing": d.missing, "attempts": d.attempts}


def address_of(turn):
    gi = turn.notes.global_information
    return (gi.wilaya, gi.commune, gi.address)


def tools_called(shop):
    return [c["name"] for c in shop.calls]


# The list has wilaya and commune twice: once from the tool arguments, once from the saved address.
# It is how the code works today.
ASK_ALL = ["wilaya", "commune", "wilaya", "commune", "address"]


def search_then_buy(chat, llm):
    """Turn 1: the customer looks for a product. Turn 2: "I want it". The createOrder draft is now open."""
    llm.script("check", {"needs_tool": True, "tool_name": "searchProducts", "reply": ""},
               {"needs_tool": True, "tool_name": "createOrder", "reply": ""})
    llm.script("query", {"tool": "searchProducts", "arguments": {"product": "Nike Air Max"}},
               {"tool": "createOrder", "arguments": {}})
    llm.script("flow", {"action": "CREATE", "product_name": "Nike Air Max"}, _continue_flow)
    llm.script("args", {"product": "Nike Air Max"}, {"productId": "p1", "quantity": 1})
    llm.script("address", {})
    llm.script("ask", "ask: wilaya, commune, address")
    llm.script("reply", "found nike")
    return chat.say("3andkom Nike Air Max?"), chat.say("nheb nchriha")


def place_first_order(chat, llm):
    search_then_buy(chat, llm)
    llm.script("args", {"wilaya": "Oran", "commune": "Bir El Djir"})
    llm.script("address", {"wilaya": "Oran", "commune": "Bir El Djir", "address": "Cité 200 logements"})
    llm.script("reply", "order created")
    return chat.say("Oran, Bir El Djir, wa7da, Cité 200 logements")


def test_buy_in_pieces(chat, llm, shop, golden):
    search, buy = search_then_buy(chat, llm)
    assert search.reply == "found nike"
    assert draft_of(search) is None
    assert draft_of(buy) == {
        "tool": "createOrder", "status": "drafting", "args": {"productId": "p1", "quantity": 1},
        "missing": ASK_ALL, "attempts": 0,
    }
    assert buy.reply == "ask: wilaya, commune, address"
    assert address_of(buy) == (None, None, None)

    llm.script("gate", *[{"decision": "continue_draft"}] * 3)
    llm.script("args", {"wilaya": "Oran"}, {"commune": "Bir El Djir"}, {}, {})
    llm.script("address", {"wilaya": "Oran"}, {"commune": "Bir El Djir"}, {}, {"address": "Cité 200 logements"})
    llm.script("ask", "ask: commune", "ask: address", "ask: address again")
    llm.script("reply", "order created")

    wilaya = chat.say("Oran")
    assert draft_of(wilaya) == {
        "tool": "createOrder", "status": "drafting",
        "args": {"productId": "p1", "quantity": 1, "wilaya": "Oran"},
        "missing": ["commune", "commune", "address"], "attempts": 0,
    }
    assert address_of(wilaya) == ("Oran", None, None)
    assert wilaya.reply == "ask: commune"

    commune = chat.say("Bir El Djir")
    assert draft_of(commune) == {
        "tool": "createOrder", "status": "drafting",
        "args": {"productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir"},
        "missing": ["address"], "attempts": 0,
    }
    assert address_of(commune) == ("Oran", "Bir El Djir", None)
    assert commune.reply == "ask: address"

    # A Darja number word, "wa7da", gives the draft nothing new. The attempts counter goes up.
    nothing_new = chat.say("wa7da")
    assert draft_of(nothing_new)["attempts"] == 1
    assert draft_of(nothing_new)["missing"] == ["address"]
    assert nothing_new.reply == "ask: address again"

    street = chat.say("Cité 200 logements")
    assert draft_of(street) is None
    assert address_of(street) == ("Oran", "Bir El Djir", "Cité 200 logements")
    assert street.reply == "order created"
    assert shop.calls[-1] == {
        "name": "createOrder",
        "args": {
            "productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir",
            "address": "Cité 200 logements",
        },
    }
    assert tools_called(shop) == ["searchProducts", "createOrder"]
    golden("buy_in_pieces")


def test_everything_in_one_message(chat, llm, shop, golden):
    turn = place_first_order(chat, llm)
    assert turn.reply == "order created"
    assert draft_of(turn) is None
    assert address_of(turn) == ("Oran", "Bir El Djir", "Cité 200 logements")
    assert tools_called(shop) == ["searchProducts", "createOrder"]
    # The args call gave no street. The street comes from the saved address.
    assert shop.calls[-1]["args"] == {
        "productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir",
        "address": "Cité 200 logements",
    }
    golden("everything_in_one_message")


def test_cancel_clears_the_draft(chat, llm, shop, golden):
    search_then_buy(chat, llm)
    llm.script("cancel", "ok, cancelled")
    turn = chat.say("khaleh")
    assert turn.reply == "ok, cancelled"
    assert draft_of(turn) is None
    assert len(llm.calls_of("check")) == 2  # the cancel turn does not run the classifier
    assert tools_called(shop) == ["searchProducts"]
    golden("cancel")


def test_side_question_keeps_the_draft(chat, llm, shop, golden):
    _, buy = search_then_buy(chat, llm)
    llm.script("gate", {"decision": "new_request"}, {"decision": "continue_draft"})
    llm.script("check", {"needs_tool": True, "tool_name": "calculateShipping", "reply": ""})
    llm.script("query", {"tool": "calculateShipping", "arguments": {"wilaya": "Oran"}})
    llm.script("flow", {"action": "NO_FLOW_LOOKUP"})
    llm.script("tools", {"name": "calculateShipping", "args": {"wilaya": "Oran"}})
    llm.script("reply", "delivery to Oran: 600 DZD")

    side = chat.say("chhal livraison l Oran?")
    assert side.reply == "delivery to Oran: 600 DZD"
    assert tools_called(shop) == ["searchProducts", "calculateShipping"]
    assert draft_of(side) == draft_of(buy)

    llm.script("args", {"wilaya": "Oran"})
    llm.script("address", {"wilaya": "Oran"})
    llm.script("ask", "ask: commune")
    back = chat.say("Oran")
    assert draft_of(back)["args"] == {"productId": "p1", "quantity": 1, "wilaya": "Oran"}
    assert back.reply == "ask: commune"
    golden("side_question")


def test_second_order_reuses_the_saved_address(chat, llm, shop, golden):
    place_first_order(chat, llm)
    llm.script("check", {"needs_tool": True, "tool_name": "createOrder", "reply": ""})
    llm.script("query", {"tool": "createOrder", "arguments": {}})
    llm.script("flow", _continue_flow)
    llm.script("args", {"productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir"})
    llm.script("reply", "second order created")

    turn = chat.say("nheb nzid wa7da khra")
    assert turn.reply == "second order created"
    assert draft_of(turn) is None
    # The address is known, so the address LLM call is not made again.
    assert len(llm.calls_of("address")) == 2
    assert tools_called(shop) == ["searchProducts", "createOrder", "createOrder"]
    assert shop.calls[-1]["args"] == {
        "productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir",
        "address": "Cité 200 logements",
    }
    golden("second_order_saved_address")


def test_second_order_still_asks_for_wilaya_and_commune_when_args_miss_them(chat, llm, shop, golden):
    place_first_order(chat, llm)
    llm.script("check", {"needs_tool": True, "tool_name": "createOrder", "reply": ""})
    llm.script("query", {"tool": "createOrder", "arguments": {}})
    llm.script("flow", _continue_flow)
    llm.script("args", {"productId": "p1", "quantity": 2})
    llm.script("ask", "ask: wilaya, commune")

    turn = chat.say("nheb zouj")
    assert turn.reply == "ask: wilaya, commune"
    assert draft_of(turn) == {
        "tool": "createOrder", "status": "drafting", "args": {"productId": "p1", "quantity": 2},
        "missing": ["wilaya", "commune"], "attempts": 0,
    }
    assert address_of(turn) == ("Oran", "Bir El Djir", "Cité 200 logements")
    assert tools_called(shop) == ["searchProducts", "createOrder"]
    golden("second_order_missing_args")


def test_second_order_to_a_new_commune_asks_for_the_street(chat, llm, shop):
    place_first_order(chat, llm)
    llm.script("check", {"needs_tool": True, "tool_name": "createOrder", "reply": ""})
    llm.script("query", {"tool": "createOrder", "arguments": {}})
    llm.script("flow", _continue_flow)
    llm.script("args", {"productId": "p1", "quantity": 1, "wilaya": "Alger", "commune": "Bab Ezzouar"})
    llm.script("address", {})
    llm.script("ask", "ask: address")

    turn = chat.say("nheb nzid wa7da khra, livraison l Alger Bab Ezzouar")
    assert turn.reply == "ask: address"
    assert draft_of(turn)["status"] == "drafting"
    assert draft_of(turn)["missing"] == ["address"]
    assert address_of(turn) == ("Alger", "Bab Ezzouar", None)
    assert tools_called(shop) == ["searchProducts", "createOrder"]

    llm.script("args", {})
    llm.script("address", {"address": "Rue 5"})
    llm.script("reply", "second order created")
    street = chat.say("Rue 5")  # a number continues the Draft without asking the gate
    assert street.reply == "second order created"
    assert address_of(street) == ("Alger", "Bab Ezzouar", "Rue 5")
    assert shop.calls[-1]["args"] == {
        "productId": "p1", "quantity": 1, "wilaya": "Alger", "commune": "Bab Ezzouar", "address": "Rue 5",
    }


def test_an_order_in_a_new_flow_still_gets_the_chosen_product(chat, llm, shop):
    # The real E2E run: the flow LLM opens a new flow for the order, and the args LLM finds nothing.
    llm.script("check", {"needs_tool": True, "tool_name": "searchProducts", "reply": ""},
               {"needs_tool": True, "tool_name": "createOrder", "reply": ""})
    llm.script("query", {"tool": "searchProducts", "arguments": {"product": "Nike Air Max"}},
               {"tool": "createOrder", "arguments": {}})
    llm.script("flow", {"action": "CREATE", "product_name": "Nike Air Max"}, {"action": "CREATE"})
    llm.script("args", {"product": "Nike Air Max"}, {})
    llm.script("address", {})
    llm.script("ask", "ask: quantity, wilaya, commune, address")
    llm.script("reply", "found nike")

    chat.say("vous avez des Nike Air Max ?")
    turn = chat.say("je veux commander le Nike Air Max")
    assert draft_of(turn)["args"] == {"productId": "p1"}
    assert "productId" not in draft_of(turn)["missing"]
    assert llm.calls_of("args")[-1].payload()["selected_product"]["product_id"] == "p1"


def chosen_products(turn):
    return [f.product_discovery.selected_product.product_id
            for f in turn.notes.flows if f.product_discovery and f.product_discovery.selected_product]


def search_two_then_buy(chat, llm):
    """Turn 1: a search shows two products. Turn 2: "I want to order", with no product named."""
    llm.script("check", {"needs_tool": True, "tool_name": "searchProducts", "reply": ""},
               {"needs_tool": True, "tool_name": "createOrder", "reply": ""})
    llm.script("query", {"tool": "searchProducts", "arguments": {"product": "nike montre"}},
               {"tool": "createOrder", "arguments": {}})
    llm.script("flow", {"action": "CREATE", "product_name": "nike montre"}, _continue_flow)
    llm.script("args", {"product": "nike montre"}, {})
    llm.script("address", {})
    llm.script("ask", "ask: which product?")
    llm.script("reply", "found 2")
    return chat.say("vous avez des nike ou des montres ?"), chat.say("je veux commander")


def test_a_list_of_products_is_not_a_choice(chat, llm, shop):
    search, buy = search_two_then_buy(chat, llm)
    assert chosen_products(search) == []
    assert "productId" not in draft_of(buy)["args"]
    assert "productId" in draft_of(buy)["missing"]
    shown = llm.calls_of("args")[-1].payload()["products_shown"]
    assert {p["product_id"] for p in shown} == {"p1", "p2"}


def test_the_customer_picks_from_the_list_by_name(chat, llm, shop):
    search_two_then_buy(chat, llm)
    llm.script("gate", {"decision": "continue_draft"})
    llm.script("args", {"productId": "p2"})
    llm.script("address", {})
    llm.script("ask", "ask: quantity")
    turn = chat.say("je prends Montre Casio")
    assert draft_of(turn)["args"]["productId"] == "p2"


def test_a_product_id_that_was_never_shown_is_dropped(chat, llm, shop):
    search_two_then_buy(chat, llm)
    llm.script("gate", {"decision": "continue_draft"})
    llm.script("args", {"productId": "Casio"})
    llm.script("address", {})
    llm.script("ask", "ask: which product?")
    turn = chat.say("je prends Casio")
    assert "productId" not in draft_of(turn)["args"]
    assert "productId" in draft_of(turn)["missing"]


def test_the_choice_is_forgotten_after_an_order(chat, llm, shop):
    turn = place_first_order(chat, llm)
    assert chosen_products(turn) == []


def search_two(chat, llm):
    llm.script("check", {"needs_tool": True, "tool_name": "searchProducts", "reply": ""})
    llm.script("query", {"tool": "searchProducts", "arguments": {"product": "nike montre"}})
    llm.script("flow", {"action": "CREATE", "product_name": "nike montre"})
    llm.script("args", {"product": "nike montre"})
    llm.script("reply", "found 2")
    return chat.say("vous avez des nike ou des montres ?")


def ask_details(chat, llm, name, flow):
    llm.script("check", {"needs_tool": True, "tool_name": "getProductDetails", "reply": ""})
    llm.script("query", {"tool": "getProductDetails", "arguments": {"productName": name}})
    llm.script("flow", flow)
    llm.script("args", {"productName": name})
    llm.script("reply", f"details {name}")
    return chat.say(f"details {name} ?")


def test_details_select_one_product_and_keep_the_list(chat, llm, shop):
    search_two(chat, llm)
    casio = ask_details(chat, llm, "Montre Casio", _continue_flow)
    assert chosen_products(casio) == ["p2"]
    assert {p["product_id"] for p in shown_products(casio.notes)} == {"p1", "p2"}

    nike = ask_details(chat, llm, "Nike Air Max", {"action": "CREATE", "product_name": "Nike Air Max"})
    assert chosen_products(nike) == ["p1"]  # only one product is selected at a time


def test_a_failed_order_keeps_the_selected_product(chat, llm, shop, monkeypatch):
    fake = tools.registry.call_tool

    def create_order_fails(name, entities):
        if name == "createOrder":
            return json.dumps({"outcome": 0, "error": "commune not found"})
        return fake(name, entities)

    monkeypatch.setattr(tools.registry, "call_tool", create_order_fails)
    turn = place_first_order(chat, llm)
    assert chosen_products(turn) == ["p1"]


def first_order_fails(monkeypatch, error):
    """createOrder fails once with `error`, then the fake shop answers as usual."""
    fake = tools.registry.call_tool
    failed = []

    def create_order(name, entities):
        if name == "createOrder" and not failed:
            failed.append(entities)
            return json.dumps({"outcome": 0, "error": error})
        return fake(name, entities)

    monkeypatch.setattr(tools.registry, "call_tool", create_order)
    return failed


def test_a_failed_order_keeps_what_the_customer_gave(chat, llm, shop, monkeypatch):
    first_order_fails(monkeypatch, "only 1 left in stock")
    turn = place_first_order(chat, llm)
    assert draft_of(turn) == {
        "tool": "createOrder", "status": "drafting",
        "args": {"productId": "p1", "quantity": 1, "wilaya": "Oran", "commune": "Bir El Djir"},
        "missing": [], "attempts": 0,
    }
    assert address_of(turn) == ("Oran", "Bir El Djir", "Cité 200 logements")

    llm.script("gate", {"decision": "continue_draft"})
    llm.script("args", {"quantity": 2})
    llm.script("reply", "order created")
    fixed = chat.say("jouj")
    assert fixed.reply == "order created"
    assert draft_of(fixed) is None
    assert shop.calls[-1]["args"] == {
        "productId": "p1", "quantity": 2, "wilaya": "Oran", "commune": "Bir El Djir",
        "address": "Cité 200 logements",
    }


def test_a_failed_order_is_not_sent_again_without_a_fix(chat, llm, shop, monkeypatch):
    failed = first_order_fails(monkeypatch, "only 1 left in stock")
    place_first_order(chat, llm)
    # The real LLM often sends back values the Draft already has. That is not a fix.
    llm.script("args", {"productId": "p1", "quantity": 1})
    llm.script("ask", "how many do you want?")
    turn = chat.say("ok")
    assert turn.reply == "how many do you want?"
    assert len(failed) == 1
    assert "createOrder" not in tools_called(shop)
    assert draft_of(turn)["attempts"] == 1
    # The LLM that asks sees why the order failed.
    assert llm.calls_of("ask")[-1].payload()["last_error"] == "only 1 left in stock"


def test_a_new_commune_after_a_failed_order_asks_the_street_again(chat, llm, shop, monkeypatch):
    first_order_fails(monkeypatch, "commune not found")
    place_first_order(chat, llm)
    llm.script("gate", {"decision": "continue_draft"})
    llm.script("args", {"commune": "Es Senia"})
    llm.script("address", {})
    llm.script("ask", "ask: address")
    turn = chat.say("Es Senia")
    # The address rule: a new commune makes the saved street wrong.
    assert turn.reply == "ask: address"
    assert draft_of(turn)["missing"] == ["address"]
    assert address_of(turn) == ("Oran", "Es Senia", None)


def test_llm_errors_keep_the_draft_and_use_the_fallback_question(chat, llm, shop):
    search_then_buy(chat, llm)
    llm.script("gate", {"decision": "continue_draft"})
    llm.script("args", _llm_down)
    llm.script("address", _llm_down)
    llm.script("ask", "")

    turn = chat.say("Oran")
    assert turn.reply == ASK_MORE_INFO
    assert draft_of(turn) == {
        "tool": "createOrder", "status": "drafting", "args": {"productId": "p1", "quantity": 1},
        "missing": ASK_ALL, "attempts": 1,
    }
    assert address_of(turn) == (None, None, None)


def test_gate_error_treats_the_message_as_a_new_request(chat, llm, shop):
    _, buy = search_then_buy(chat, llm)
    llm.script("gate", "not json", "still not json")
    llm.script("check", {"needs_tool": False, "tool_name": None, "reply": "salam, how can I help?"})

    turn = chat.say("hmm")
    assert turn.reply == "salam, how can I help?"
    assert draft_of(turn) == draft_of(buy)
