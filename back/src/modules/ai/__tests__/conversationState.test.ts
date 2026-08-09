import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  TOOL_STATE_TRANSITIONS,
  nextConversationState,
} from '../conversationState';
import type { ToolName } from '../schemas/intents.schemas';

describe('TOOL_STATE_TRANSITIONS', () => {
  it('maps every flow-moving tool to the right state', () => {
    assert.equal(TOOL_STATE_TRANSITIONS.searchProducts, 'PRODUCT_DISCOVERY');
    assert.equal(TOOL_STATE_TRANSITIONS.recallPreviousProducts, 'PRODUCT_DISCOVERY');
    assert.equal(TOOL_STATE_TRANSITIONS.chooseProduct, 'PRODUCT_SELECTED');
    assert.equal(TOOL_STATE_TRANSITIONS.getProductDetails, 'PRODUCT_SELECTED');
    assert.equal(TOOL_STATE_TRANSITIONS.createOrder, 'WAITING_CONFIRMATION');
    assert.equal(TOOL_STATE_TRANSITIONS.confirmOrder, 'CONFIRMED');
    assert.equal(TOOL_STATE_TRANSITIONS.cancelOrder, 'CANCELLED');
  });

  it('leaves state-neutral tools out of the transition map', () => {
    assert.equal(TOOL_STATE_TRANSITIONS.getOrderStatus, undefined);
    assert.equal(TOOL_STATE_TRANSITIONS.calculateShipping, undefined);
    assert.equal(TOOL_STATE_TRANSITIONS.escalateConversation, undefined);
  });
});

describe('nextConversationState', () => {
  it('(1) a new product search while WAITING_CONFIRMATION moves the conversation to PRODUCT_DISCOVERY', () => {
    const next = nextConversationState('WAITING_CONFIRMATION', 'searchProducts', true);
    assert.equal(next, 'PRODUCT_DISCOVERY');
    // The follow-up acknowledgment "okay" therefore sees PRODUCT_DISCOVERY,
    // not a stale WAITING_CONFIRMATION.
    assert.notEqual(next, 'WAITING_CONFIRMATION');
  });

  it('(2) a genuine order confirmation while actually waiting keeps CONFIRMED', () => {
    assert.equal(
      nextConversationState('WAITING_CONFIRMATION', 'confirmOrder', true),
      'CONFIRMED',
    );
  });

  it('(3) selecting a product after a search moves to PRODUCT_SELECTED', () => {
    assert.equal(
      nextConversationState('PRODUCT_DISCOVERY', 'chooseProduct', true),
      'PRODUCT_SELECTED',
    );
  });

  it('(4) switching from an order flow to a completely new product search invalidates the pending confirmation', () => {
    const afterSearch = nextConversationState('WAITING_CONFIRMATION', 'searchProducts', true);
    assert.equal(afterSearch, 'PRODUCT_DISCOVERY');

    const afterRecall = nextConversationState('WAITING_CONFIRMATION', 'recallPreviousProducts', true);
    assert.equal(afterRecall, 'PRODUCT_DISCOVERY');
  });

  it('recall / details / cancel transitions too', () => {
    assert.equal(
      nextConversationState('WAITING_CONFIRMATION', 'recallPreviousProducts', true),
      'PRODUCT_DISCOVERY',
    );
    assert.equal(
      nextConversationState('PRODUCT_DISCOVERY', 'getProductDetails', true),
      'PRODUCT_SELECTED',
    );
    assert.equal(
      nextConversationState('WAITING_CONFIRMATION', 'cancelOrder', true),
      'CANCELLED',
    );
    assert.equal(
      nextConversationState('IDLE', 'createOrder', true),
      'WAITING_CONFIRMATION',
    );
  });

  it('failed tools never advance the state', () => {
    assert.equal(
      nextConversationState('WAITING_CONFIRMATION', 'searchProducts', false),
      'WAITING_CONFIRMATION',
    );
    assert.equal(
      nextConversationState('WAITING_CONFIRMATION', 'confirmOrder', false),
      'WAITING_CONFIRMATION',
    );
  });

  it('status, shipping and escalation tools keep the state unchanged', () => {
    const neutral: ToolName[] = ['getOrderStatus', 'calculateShipping', 'escalateConversation'];
    for (const tool of neutral) {
      assert.equal(nextConversationState('PRODUCT_SELECTED', tool, true), 'PRODUCT_SELECTED');
    }
  });
});
