from models.conversation import ConversationMemory


def test_saved_draft_with_old_fields_still_loads():
    """The notes in Postgres can hold drafts saved by an older version. They must still load."""
    saved = {
        "global_information": {"customer_name": None, "wilaya": "Oran", "commune": None, "address": None},
        "active_flow_id": "f1",
        "flows": [{
            "flow_id": "f1",
            "state": "ORDER",
            "created_at": "2026-10-01T10:00:00Z",
            "updated_at": "2026-10-01T10:05:00Z",
            "tool_draft": {
                "tool_name": "createOrder",
                "args": {"productId": "p1", "quantity": 1},
                "prereqs": {"wilaya": "Oran", "commune": None, "address": None},
                "status": "drafting",
                "attempts": 2,
                "missing": ["commune", "address"],
            },
        }],
    }
    draft = ConversationMemory(**saved).flows[0].tool_draft
    assert draft.tool_name == "createOrder"
    assert draft.args == {"productId": "p1", "quantity": 1}
    assert draft.status == "drafting"
    assert draft.attempts == 2
    assert draft.missing == ["commune", "address"]


def test_saved_flow_with_the_removed_shipping_copy_still_loads():
    saved = {
        "global_information": {"wilaya": "Oran"},
        "active_flow_id": "f1",
        "flows": [{
            "flow_id": "f1",
            "state": "ORDER",
            "created_at": "2026-10-01T10:00:00Z",
            "updated_at": "2026-10-01T10:05:00Z",
            "shipping": {"wilaya": "Oran", "commune": None, "address": None, "shipping_cost": None},
        }],
    }
    notes = ConversationMemory(**saved)
    assert notes.flows[0].flow_id == "f1"
    assert notes.global_information.wilaya == "Oran"
