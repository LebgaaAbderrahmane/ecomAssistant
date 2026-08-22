import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createFlow,
  toProductSelected,
  toOrderPending,
  toOrderConfirmed,
  toOrderShipped,
  toOrderCancelled,
  toFinished,
} from '../flowHelper';
import type { Flow } from '../memory.types';

afterEach(() => {
  vi.useRealTimers();
});

describe('createFlow', () => {
  it('generates UUID flowId', () => {
    const flow = createFlow({ productName: 'shoes', filters: {} });
    expect(flow.flowId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('sets state to PRODUCT_DISCOVERY', () => {
    const flow = createFlow({ productName: 'phones', filters: {} });
    expect(flow.state).toBe('PRODUCT_DISCOVERY');
  });

  it('sets ISO string dates for createdAt and updatedAt', () => {
    const before = Date.now();
    const flow = createFlow({ productName: 'laptops', filters: {} });
    const after = Date.now();

    expect(typeof flow.createdAt).toBe('string');
    expect(typeof flow.updatedAt).toBe('string');
    expect(new Date(flow.createdAt).getTime()).toBeGreaterThanOrEqual(before);
    expect(new Date(flow.createdAt).getTime()).toBeLessThanOrEqual(after);
  });

  it('stores input filters in productDiscovery.input', () => {
    const flow = createFlow({
      productName: 'sneakers',
      filters: { category: 'shoes', color: 'black', maxPrice: 5000 },
    });
    expect(flow.productDiscovery.input.productName).toBe('sneakers');
    expect(flow.productDiscovery.input.filters).toEqual({
      category: 'shoes',
      color: 'black',
      maxPrice: 5000,
    });
  });

  it('initializes empty toolResults array', () => {
    const flow = createFlow({ productName: 'test', filters: {} });
    expect(flow.productDiscovery.toolResults).toEqual([]);
  });

  it('two calls produce different flowIds', () => {
    const a = createFlow({ productName: 'a', filters: {} });
    const b = createFlow({ productName: 'b', filters: {} });
    expect(a.flowId).not.toBe(b.flowId);
  });
});

const discoveryFlow = () =>
  createFlow({ productName: 'shoes', filters: { category: 'footwear' } });

describe('toProductSelected', () => {
  it('transitions from PRODUCT_DISCOVERY to PRODUCT_SELECTED', () => {
    const discovery = discoveryFlow();
    const selected = toProductSelected(discovery);
    expect(selected.state).toBe('PRODUCT_SELECTED');
    expect(selected.flowId).toBe(discovery.flowId);
    expect(selected.productDiscovery).toBe(discovery.productDiscovery);
  });

  it('bumps updatedAt', () => {
    const discovery = discoveryFlow();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const selected = toProductSelected(discovery);
    expect(new Date(selected.updatedAt).getTime()).toBeGreaterThan(
      new Date(discovery.updatedAt).getTime(),
    );
  });
});

describe('toOrderPending', () => {
  it('transitions from PRODUCT_SELECTED to ORDER_PENDING with order data', () => {
    const discovery = discoveryFlow();
    const selected = toProductSelected(discovery);
    const orderData = { orderId: 'shopify-123', productId: 'p1', quantity: 2 };
    const pending = toOrderPending(selected, orderData);

    expect(pending.state).toBe('ORDER_PENDING');
    expect(pending.order).toEqual(orderData);
    expect(pending.flowId).toBe(discovery.flowId);
    expect(pending.productDiscovery).toBe(discovery.productDiscovery);
  });

  it('bumps updatedAt', () => {
    const selected = toProductSelected(discoveryFlow());
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const pending = toOrderPending(selected, { orderId: 'o1' });
    expect(new Date(pending.updatedAt).getTime()).toBeGreaterThan(
      new Date(selected.updatedAt).getTime(),
    );
  });
});

describe('toOrderConfirmed', () => {
  it('transitions from ORDER_PENDING to ORDER_CONFIRMED with shipping', () => {
    const flow = toOrderPending(toProductSelected(discoveryFlow()), {
      orderId: 'o1',
      productId: 'p1',
    });
    const shipping = { method: 'Yalidine', cost: 600, address: 'Oran, Bir El Djir' };
    const confirmed = toOrderConfirmed(flow, shipping);

    expect(confirmed.state).toBe('ORDER_CONFIRMED');
    expect(confirmed.shipping).toEqual(shipping);
    expect(confirmed.order).toBe(flow.order);
  });

  it('bumps updatedAt', () => {
    const flow = toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const confirmed = toOrderConfirmed(flow, { method: 'Yalidine' });
    expect(new Date(confirmed.updatedAt).getTime()).toBeGreaterThan(
      new Date(flow.updatedAt).getTime(),
    );
  });
});

describe('toOrderShipped', () => {
  it('transitions from ORDER_CONFIRMED to ORDER_SHIPPED', () => {
    const flow = toOrderConfirmed(
      toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' }),
      { method: 'Yalidine' },
    );
    const shipped = toOrderShipped(flow);

    expect(shipped.state).toBe('ORDER_SHIPPED');
    expect(shipped.shipping).toBe(flow.shipping);
    expect(shipped.order).toBe(flow.order);
  });

  it('bumps updatedAt', () => {
    const flow = toOrderConfirmed(
      toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' }),
      { method: 'Yalidine' },
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const shipped = toOrderShipped(flow);
    expect(new Date(shipped.updatedAt).getTime()).toBeGreaterThan(
      new Date(flow.updatedAt).getTime(),
    );
  });
});

describe('toOrderCancelled', () => {
  it('cancels from ORDER_PENDING', () => {
    const flow = toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' });
    const cancelled = toOrderCancelled(flow);

    expect(cancelled.state).toBe('ORDER_CANCELLED');
    expect(cancelled.order).toBe(flow.order);
  });

  it('cancels from ORDER_CONFIRMED preserving shipping', () => {
    const flow = toOrderConfirmed(
      toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' }),
      { method: 'Yalidine' },
    );
    const cancelled = toOrderCancelled(flow);

    expect(cancelled.state).toBe('ORDER_CANCELLED');
    expect(cancelled.order).toBe(flow.order);
    expect(cancelled.shipping).toBe(flow.shipping);
  });

  it('bumps updatedAt', () => {
    const flow = toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' });
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const cancelled = toOrderCancelled(flow);
    expect(new Date(cancelled.updatedAt).getTime()).toBeGreaterThan(
      new Date(flow.updatedAt).getTime(),
    );
  });
});

describe('toFinished', () => {
  it('transitions from ORDER_SHIPPED to FINISHED', () => {
    const flow = toOrderShipped(
      toOrderConfirmed(
        toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' }),
        { method: 'Yalidine' },
      ),
    );
    const finished = toFinished(flow);

    expect(finished.state).toBe('FINISHED');
    expect(finished.order).toBe(flow.order);
    expect(finished.shipping).toBe(flow.shipping);
  });

  it('bumps updatedAt', () => {
    const flow = toOrderShipped(
      toOrderConfirmed(
        toOrderPending(toProductSelected(discoveryFlow()), { orderId: 'o1' }),
        { method: 'Yalidine' },
      ),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date(Date.now() + 1000));
    const finished = toFinished(flow);
    expect(new Date(finished.updatedAt).getTime()).toBeGreaterThan(
      new Date(flow.updatedAt).getTime(),
    );
  });
});

describe('full happy path', () => {
  it('create -> selected -> pending -> confirmed -> shipped -> finished', () => {
    let flow: Flow = discoveryFlow();
    expect(flow.state).toBe('PRODUCT_DISCOVERY');

    flow = toProductSelected(flow as Extract<Flow, { state: 'PRODUCT_DISCOVERY' }>);
    expect(flow.state).toBe('PRODUCT_SELECTED');

    flow = toOrderPending(flow as Extract<Flow, { state: 'PRODUCT_SELECTED' }>, {
      orderId: 'o1',
      productId: 'p1',
      quantity: 1,
    });
    expect(flow.state).toBe('ORDER_PENDING');

    flow = toOrderConfirmed(flow as Extract<Flow, { state: 'ORDER_PENDING' }>, {
      method: 'Yalidine',
      cost: 600,
    });
    expect(flow.state).toBe('ORDER_CONFIRMED');

    flow = toOrderShipped(flow as Extract<Flow, { state: 'ORDER_CONFIRMED' }>);
    expect(flow.state).toBe('ORDER_SHIPPED');

    flow = toFinished(flow as Extract<Flow, { state: 'ORDER_SHIPPED' }>);
    expect(flow.state).toBe('FINISHED');
  });

  it('preserve flowId through entire lifecycle', () => {
    let flow: Flow = discoveryFlow();
    const originalId = flow.flowId;

    flow = toProductSelected(flow as Extract<Flow, { state: 'PRODUCT_DISCOVERY' }>);
    flow = toOrderPending(flow as Extract<Flow, { state: 'PRODUCT_SELECTED' }>, { orderId: 'o1' });
    flow = toOrderConfirmed(flow as Extract<Flow, { state: 'ORDER_PENDING' }>, { method: 'Yalidine' });
    flow = toOrderShipped(flow as Extract<Flow, { state: 'ORDER_CONFIRMED' }>);
    flow = toFinished(flow as Extract<Flow, { state: 'ORDER_SHIPPED' }>);

    expect(flow.flowId).toBe(originalId);
  });
});
