import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createFlow,
  createMemoryFromOrder,
  addOrderFlowToMemory,
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

  it('stores selectedProductId when provided', () => {
    const discovery = discoveryFlow();
    const selected = toProductSelected(discovery, 'p1');
    expect(selected.selectedProductId).toBe('p1');
  });

  it('leaves selectedProductId undefined when not provided', () => {
    const discovery = discoveryFlow();
    const selected = toProductSelected(discovery);
    expect(selected.selectedProductId).toBeUndefined();
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

// ---------------------------------------------------------------------------
// createMemoryFromOrder
// ---------------------------------------------------------------------------

describe('createMemoryFromOrder', () => {
  it('creates memory with ORDER_PENDING flow', () => {
    const memory = createMemoryFromOrder({
      orderId: 'order-1',
      productName: 'iPhone 14',
      totalAmount: 89000,
    });
    expect(memory.flows).toHaveLength(1);
    expect(memory.flows[0].state).toBe('ORDER_PENDING');
    expect(memory.activeFlow).toBe(memory.flows[0].flowId);
  });

  it('populates productDiscovery with order data', () => {
    const memory = createMemoryFromOrder({
      orderId: 'order-1',
      productName: 'iPhone 14',
      totalAmount: 89000,
      productId: 'prod-123',
    });
    const flow = memory.flows[0];
    if (flow.state !== 'ORDER_PENDING') throw new Error('expected ORDER_PENDING');
    expect(flow.productDiscovery.input.productName).toBe('iPhone 14');
    expect(flow.productDiscovery.toolResults).toHaveLength(1);
    expect(flow.productDiscovery.toolResults[0].productName).toBe('iPhone 14');
    expect(flow.productDiscovery.toolResults[0].price).toBe(89000);
  });

  it('populates order data with orderId and quantity', () => {
    const memory = createMemoryFromOrder({
      orderId: 'order-1',
      productName: 'iPhone 14',
      totalAmount: 89000,
      quantity: 2,
    });
    const flow = memory.flows[0];
    if (flow.state !== 'ORDER_PENDING') throw new Error('expected ORDER_PENDING');
    expect(flow.order.orderId).toBe('order-1');
    expect(flow.order.quantity).toBe(2);
  });

  it('defaults quantity to 1 when not provided', () => {
    const memory = createMemoryFromOrder({
      orderId: 'order-1',
      productName: 'iPhone 14',
      totalAmount: 89000,
    });
    const flow = memory.flows[0];
    if (flow.state !== 'ORDER_PENDING') throw new Error('expected ORDER_PENDING');
    expect(flow.order.quantity).toBe(1);
  });

  it('populates globalInformation from order data', () => {
    const memory = createMemoryFromOrder({
      orderId: 'order-1',
      productName: 'iPhone 14',
      totalAmount: 89000,
      customerName: 'Ahmed',
      wilaya: 'Alger',
      commune: 'Bab Ezzouar',
    });
    expect(memory.globalInformation.customerName).toBe('Ahmed');
    expect(memory.globalInformation.wilaya).toBe('Alger');
    expect(memory.globalInformation.commune).toBe('Bab Ezzouar');
  });

  it('sets version to CURRENT_MEMORY_VERSION', () => {
    const memory = createMemoryFromOrder({
      orderId: 'order-1',
      productName: 'iPhone 14',
      totalAmount: 89000,
    });
    expect(memory.version).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// addOrderFlowToMemory
// ---------------------------------------------------------------------------

describe('addOrderFlowToMemory', () => {
  const orderInput = {
    orderId: 'order-new',
    productName: 'Galaxy S24',
    totalAmount: 120000,
    quantity: 2,
    wilaya: 'Oran',
    commune: 'Bir El Djir',
    customerName: 'Sara',
    productId: 'prod-456',
  };

  it('appends ORDER_PENDING flow to empty memory', () => {
    const memory = addOrderFlowToMemory(
      { version: 1, globalInformation: {}, flows: [] },
      orderInput,
    );
    expect(memory.flows).toHaveLength(1);
    expect(memory.flows[0].state).toBe('ORDER_PENDING');
    expect(memory.activeFlow).toBe(memory.flows[0].flowId);
  });

  it('preserves existing flows when appending', () => {
    const existing = createMemoryFromOrder({
      orderId: 'order-old',
      productName: 'iPhone 14',
      totalAmount: 89000,
    });
    expect(existing.flows).toHaveLength(1);

    const merged = addOrderFlowToMemory(existing, orderInput);
    expect(merged.flows).toHaveLength(2);
    expect(merged.flows[0].state).toBe('ORDER_PENDING');
    expect(merged.flows[1].state).toBe('ORDER_PENDING');
    // activeFlow points to the NEW flow
    expect(merged.activeFlow).toBe(merged.flows[1].flowId);
    expect(merged.activeFlow).not.toBe(existing.activeFlow);
  });

  it('fills missing globalInformation without overwriting existing', () => {
    const existing = addOrderFlowToMemory(
      { version: 1, globalInformation: { customerName: 'Ahmed', wilaya: 'Alger' }, flows: [] },
      { orderId: 'o1', productName: 'Test', totalAmount: 100 },
    );
    // customerName and wilaya preserved, commune added
    expect(existing.globalInformation.customerName).toBe('Ahmed');
    expect(existing.globalInformation.wilaya).toBe('Alger');
    expect(existing.globalInformation.commune).toBeUndefined();
  });

  it('overwrites globalInformation when input provides values', () => {
    const existing = addOrderFlowToMemory(
      { version: 1, globalInformation: { customerName: 'Ahmed' }, flows: [] },
      { orderId: 'o1', productName: 'Test', totalAmount: 100, customerName: 'Sara', wilaya: 'Oran' },
    );
    expect(existing.globalInformation.customerName).toBe('Sara');
    expect(existing.globalInformation.wilaya).toBe('Oran');
  });

  it('preserves recentIntents and other memory fields', () => {
    const existing = addOrderFlowToMemory(
      { version: 1, globalInformation: {}, flows: [], recentIntents: ['PRODUCT_SEARCH', 'AFFIRM'] },
      { orderId: 'o1', productName: 'Test', totalAmount: 100 },
    );
    expect(existing.recentIntents).toEqual(['PRODUCT_SEARCH', 'AFFIRM']);
  });

  it('defaults productId to orderId when not provided', () => {
    const merged = addOrderFlowToMemory(
      { version: 1, globalInformation: {}, flows: [] },
      { orderId: 'order-99', productName: 'Test', totalAmount: 500 },
    );
    const flow = merged.flows[0];
    if (flow.state !== 'ORDER_PENDING') throw new Error('expected ORDER_PENDING');
    expect(flow.order.productId).toBe('order-99');
    expect(flow.productDiscovery.toolResults[0].productId).toBe('order-99');
  });

  it('creates a fresh flowId for each appended flow', () => {
    const empty = { version: 1, globalInformation: {}, flows: [] };
    const first = addOrderFlowToMemory(empty, orderInput);
    const second = addOrderFlowToMemory(first, orderInput);
    // second.flows[0] is the old flow (spread-copied), second.flows[1] is new
    expect(second.flows[0].flowId).not.toBe(second.flows[1].flowId);
  });
});
