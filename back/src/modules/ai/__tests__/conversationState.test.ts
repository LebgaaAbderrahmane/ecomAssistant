import { describe, it, expect } from 'vitest';
import {
  TOOL_STATE_TRANSITIONS,
  nextConversationState,
} from '../conversationState';
import type { ToolName } from '../schemas/intents.schemas';

describe('TOOL_STATE_TRANSITIONS', () => {
  it('maps every flow-moving tool to the right state', () => {
    expect(TOOL_STATE_TRANSITIONS.searchProducts).toBe('PRODUCT_DISCOVERY');
    expect(TOOL_STATE_TRANSITIONS.recallPreviousProducts).toBe('PRODUCT_DISCOVERY');
    expect(TOOL_STATE_TRANSITIONS.suggestProducts).toBe('PRODUCT_DISCOVERY');
    expect(TOOL_STATE_TRANSITIONS.selectProduct).toBe('PRODUCT_SELECTED');
    expect(TOOL_STATE_TRANSITIONS.getProductDetails).toBe('PRODUCT_SELECTED');
    expect(TOOL_STATE_TRANSITIONS.createOrder).toBe('WAITING_CONFIRMATION');
    expect(TOOL_STATE_TRANSITIONS.confirmOrder).toBe('CONFIRMED');
    expect(TOOL_STATE_TRANSITIONS.cancelOrder).toBe('CANCELLED');
  });

  it('leaves state-neutral tools out of the transition map', () => {
    expect(TOOL_STATE_TRANSITIONS.getOrderStatus).toBeUndefined();
    expect(TOOL_STATE_TRANSITIONS.calculateShipping).toBeUndefined();
    expect(TOOL_STATE_TRANSITIONS.escalateConversation).toBeUndefined();
  });
});

describe('nextConversationState', () => {
  it('(1) a new product search while WAITING_CONFIRMATION moves the conversation to PRODUCT_DISCOVERY', () => {
    const next = nextConversationState('WAITING_CONFIRMATION', 'searchProducts', true);
    expect(next).toBe('PRODUCT_DISCOVERY');
    expect(next).not.toBe('WAITING_CONFIRMATION');
  });

  it('(2) a genuine order confirmation while actually waiting keeps CONFIRMED', () => {
    expect(
      nextConversationState('WAITING_CONFIRMATION', 'confirmOrder', true),
    ).toBe('CONFIRMED');
  });

  it('(3) selecting a product after a search moves to PRODUCT_SELECTED', () => {
    expect(
      nextConversationState('PRODUCT_DISCOVERY', 'selectProduct', true),
    ).toBe('PRODUCT_SELECTED');
  });

  it('(4) switching from an order flow to a completely new product search invalidates the pending confirmation', () => {
    const afterSearch = nextConversationState('WAITING_CONFIRMATION', 'searchProducts', true);
    expect(afterSearch).toBe('PRODUCT_DISCOVERY');

    const afterRecall = nextConversationState('WAITING_CONFIRMATION', 'recallPreviousProducts', true);
    expect(afterRecall).toBe('PRODUCT_DISCOVERY');
  });

  it('recall / details / cancel transitions too', () => {
    expect(
      nextConversationState('WAITING_CONFIRMATION', 'recallPreviousProducts', true),
    ).toBe('PRODUCT_DISCOVERY');
    expect(
      nextConversationState('PRODUCT_DISCOVERY', 'getProductDetails', true),
    ).toBe('PRODUCT_SELECTED');
    expect(
      nextConversationState('WAITING_CONFIRMATION', 'cancelOrder', true),
    ).toBe('CANCELLED');
    expect(
      nextConversationState('IDLE', 'createOrder', true),
    ).toBe('WAITING_CONFIRMATION');
  });

  it('a recommendation while WAITING_CONFIRMATION moves to PRODUCT_DISCOVERY', () => {
    expect(
      nextConversationState('WAITING_CONFIRMATION', 'suggestProducts', true),
    ).toBe('PRODUCT_DISCOVERY');
  });

  it('failed tools never advance the state', () => {
    expect(
      nextConversationState('WAITING_CONFIRMATION', 'searchProducts', false),
    ).toBe('WAITING_CONFIRMATION');
    expect(
      nextConversationState('WAITING_CONFIRMATION', 'confirmOrder', false),
    ).toBe('WAITING_CONFIRMATION');
  });

  it('status, shipping and escalation tools keep the state unchanged', () => {
    const neutral: ToolName[] = ['getOrderStatus', 'calculateShipping', 'escalateConversation'];
    for (const tool of neutral) {
      expect(nextConversationState('PRODUCT_SELECTED', tool, true)).toBe('PRODUCT_SELECTED');
    }
  });
});
