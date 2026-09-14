import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { TOOL_STATE_TRANSITIONS } from '../conversationState';

describe('TOOL_STATE_TRANSITIONS', () => {
  it('maps every flow-moving tool to the right state', () => {
    assert.equal(TOOL_STATE_TRANSITIONS.searchProducts, 'PRODUCT_DISCOVERY');
    assert.equal(TOOL_STATE_TRANSITIONS.suggestProducts, 'PRODUCT_DISCOVERY');
    assert.equal(TOOL_STATE_TRANSITIONS.selectProduct, 'PRODUCT_SELECTED');
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
