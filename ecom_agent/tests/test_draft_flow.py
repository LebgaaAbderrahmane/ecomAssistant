"""How the Draft behaves, tested through the whole graph with a scripted LLM and the fake shop.

These tests describe what the agent does with a Draft. They were first run on the code before the Draft moved
into drafts.py, and they passed on both.
Each turn is checked on: the reply, the Draft in the notes, the saved address, and the exact LLM input.
"""
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


def test_second_order_to_a_new_place_asks_for_the_street(chat, llm, shop):
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
