"""Unit tests for the order-confirmation flow.

Covers the deterministic connection between a freshly created order and the
confirmOrder / cancelOrder tools:

- nodes/calling.py::_record_created_order  — records the order in the active
  flow and seeds a pending confirmOrder draft after createOrder succeeds.
- nodes/draft.py::_swap_confirm_to_cancel  — re-targets a pending confirmation
  at cancelOrder when the customer refuses.
- nodes/reply.py::_pending_confirmation    — flags that the reply should ask
  the customer to confirm the order.
"""

import json
import unittest
from datetime import datetime, timezone

from langchain_core.messages import ToolMessage

from models.conversation import ConversationMemory
from models.domain import Flow, FlowState, OrderContext, ToolCallDraft
from models.state import AgentState
from nodes.calling import _record_created_order
from nodes.draft import _swap_confirm_to_cancel
from nodes.reply import _pending_confirmation


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _flow(order_id: str | None = None, draft: ToolCallDraft | None = None) -> Flow:
    flow = Flow(flow_id="flow-1", state=FlowState.ORDER, created_at=_now(), updated_at=_now())
    if order_id:
        flow.order = OrderContext(order_id=order_id)
    if draft is not None:
        flow.tool_draft = draft
    return flow


def _confirm_draft(order_id: str | None) -> ToolCallDraft:
    args = {"orderId": order_id} if order_id else {}
    return ToolCallDraft(tool_name="confirmOrder", args=args, status="drafting")


def _state(flow: Flow, active_flow_id: str = "flow-1", resolved_flow_id: str | None = None) -> AgentState:
    memory = ConversationMemory(flows=[flow], active_flow_id=active_flow_id)
    return AgentState(
        messages=[],
        conversation_memory=memory,
        resolved_flow_id=resolved_flow_id,
    )


class RecordCreatedOrderTests(unittest.TestCase):
    def test_records_order_and_seeds_confirm_draft(self):
        flow = _flow()
        payload = json.dumps({
            "orderId": "o1",
            "productName": "Shoes",
            "quantity": 2,
            "wilaya": "Alger",
            "commune": "Bab Ezzouar",
        })
        _record_created_order(flow, [ToolMessage(content=payload, name="createOrder", tool_call_id="t1")])

        self.assertEqual(flow.order.order_id, "o1")
        self.assertEqual(flow.order.quantity, 2)
        self.assertEqual(flow.shipping.wilaya, "Alger")
        self.assertEqual(flow.shipping.commune, "Bab Ezzouar")
        self.assertIsNotNone(flow.tool_draft)
        self.assertEqual(flow.tool_draft.tool_name, "confirmOrder")
        self.assertEqual(flow.tool_draft.status, "drafting")
        self.assertEqual(flow.tool_draft.args.get("orderId"), "o1")

    def test_ignores_failed_create(self):
        flow = _flow()
        payload = json.dumps({"outcome": "OUTCOME_NOT_FOUND", "error": "Product not found"})
        _record_created_order(flow, [ToolMessage(content=payload, name="createOrder", tool_call_id="t1")])

        self.assertIsNone(flow.order)
        self.assertIsNone(flow.tool_draft)

    def test_ignores_non_json_content(self):
        flow = _flow()
        _record_created_order(flow, [ToolMessage(content="Tool execution failed: boom", name="createOrder", tool_call_id="t1")])

        self.assertIsNone(flow.order)
        self.assertIsNone(flow.tool_draft)

    def test_ignores_empty_messages(self):
        flow = _flow()
        _record_created_order(flow, [])
        self.assertIsNone(flow.order)
        self.assertIsNone(flow.tool_draft)


class SwapConfirmToCancelTests(unittest.TestCase):
    def test_swaps_pending_confirmation_to_cancel(self):
        flow = _flow(draft=_confirm_draft("o1"))
        self.assertTrue(_swap_confirm_to_cancel(flow))
        self.assertEqual(flow.tool_draft.tool_name, "cancelOrder")
        self.assertEqual(flow.tool_draft.status, "drafting")
        self.assertEqual(flow.tool_draft.args.get("orderId"), "o1")

    def test_no_swap_without_order_id(self):
        flow = _flow(draft=_confirm_draft(None))
        original = flow.tool_draft
        self.assertFalse(_swap_confirm_to_cancel(flow))
        self.assertIs(flow.tool_draft, original)

    def test_no_swap_for_non_confirm_draft(self):
        flow = _flow(draft=ToolCallDraft(tool_name="createOrder", status="drafting"))
        self.assertFalse(_swap_confirm_to_cancel(flow))
        self.assertEqual(flow.tool_draft.tool_name, "createOrder")

    def test_no_swap_when_draft_executed(self):
        draft = _confirm_draft("o1")
        draft.status = "executed"
        flow = _flow(draft=draft)
        self.assertFalse(_swap_confirm_to_cancel(flow))

    def test_no_swap_without_flow(self):
        self.assertFalse(_swap_confirm_to_cancel(None))


class PendingConfirmationTests(unittest.TestCase):
    def test_true_when_confirmation_pending(self):
        flow = _flow(order_id="o1", draft=_confirm_draft("o1"))
        self.assertTrue(_pending_confirmation(_state(flow)))

    def test_false_after_confirmation_executed(self):
        draft = _confirm_draft("o1")
        draft.status = "executed"
        flow = _flow(order_id="o1", draft=draft)
        self.assertFalse(_pending_confirmation(_state(flow)))

    def test_false_without_draft(self):
        flow = _flow(order_id="o1")
        self.assertFalse(_pending_confirmation(_state(flow)))

    def test_false_when_draft_belongs_to_another_flow(self):
        flow = _flow(order_id="o1", draft=_confirm_draft("o1"))
        flow.flow_id = "flow-other"
        state = _state(flow, active_flow_id="flow-active")
        self.assertFalse(_pending_confirmation(state))

    def test_true_using_resolved_flow_id(self):
        flow = _flow(order_id="o1", draft=_confirm_draft("o1"))
        flow.flow_id = "flow-resolved"
        state = _state(flow, active_flow_id="flow-active", resolved_flow_id="flow-resolved")
        self.assertTrue(_pending_confirmation(state))


if __name__ == "__main__":
    unittest.main()