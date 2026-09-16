import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SearchProductsArgsSchema,
  SelectProductArgsSchema,
  GetProductDetailsArgsSchema,
  SuggestProductsArgsSchema,
  CreateOrderArgsSchema,
  ConfirmOrderArgsSchema,
  ModifyOrderArgsSchema,
  CancelOrderArgsSchema,
  CalculateShippingArgsSchema,
  GetOrderStatusArgsSchema,
  EscalateConversationArgsSchema,
} from '../schemas/intents.schemas';
import type { ToolName } from '../schemas/intents.schemas';

const ALL_TOOL_SCHEMAS: Record<ToolName, unknown> = {
  searchProducts: SearchProductsArgsSchema,
  selectProduct: SelectProductArgsSchema,
  getProductDetails: GetProductDetailsArgsSchema,
  suggestProducts: SuggestProductsArgsSchema,
  createOrder: CreateOrderArgsSchema,
  confirmOrder: ConfirmOrderArgsSchema,
  modifyOrder: ModifyOrderArgsSchema,
  cancelOrder: CancelOrderArgsSchema,
  calculateShipping: CalculateShippingArgsSchema,
  getOrderStatus: GetOrderStatusArgsSchema,
  escalateConversation: EscalateConversationArgsSchema,
};

function failedPaths(actual: unknown, input: unknown): string[] {
  const result = (actual as { safeParse(input: unknown): { success: boolean; error: { issues: { path: (string | number)[] }[] } } }).safeParse(input);
  assert.equal(result.success, false, 'expected parse failure');
  return result.error.issues.map((issue) => String(issue.path[0]));
}

describe('tool schemas: injected identity contract (M6-1)', () => {
  const TOOL_NAMES: ToolName[] = Object.keys(ALL_TOOL_SCHEMAS) as ToolName[];

  it('every executable tool has an args schema', () => {
    assert.equal(TOOL_NAMES.length, 11);
    for (const name of TOOL_NAMES) assert.ok(ALL_TOOL_SCHEMAS[name], `${name} must have a schema`);
  });

  it('every tool requires the injected merchantId', () => {
    for (const [name, schema] of Object.entries(ALL_TOOL_SCHEMAS)) {
      const paths = failedPaths(schema, {});
      assert.ok(paths.includes('merchantId'), `${name} must flag missing merchantId (got ${paths})`);
    }
  });

  it('write tools require injected customerId + conversationId', () => {
    const writeTools: ToolName[] = ['createOrder', 'confirmOrder', 'cancelOrder', 'escalateConversation'];
    for (const name of writeTools) {
      const paths = failedPaths(ALL_TOOL_SCHEMAS[name], { merchantId: 'm1' });
      assert.ok(paths.includes('customerId'), `${name} must flag missing customerId (got ${paths})`);
      assert.ok(paths.includes('conversationId'), `${name} must flag missing conversationId (got ${paths})`);
    }
  });

  it('modifyOrder receives the current order via orderId', () => {
    assert.ok(!(ModifyOrderArgsSchema.safeParse({ quantity: 2 }).success), 'must reject without identity');
    const injected = ModifyOrderArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      quantity: 2,
      orderId: 'ord_1',
    });
    assert.equal(injected.success, true);
    assert.ok(injected.success && injected.data.orderId === 'ord_1');
  });

  it('searchProducts requires an explicit product name to search for', () => {
    const byName = SearchProductsArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1', product: 'iphone' });
    assert.equal(byName.success, true);
    // Passing a bare product-id or leaving out product both fail — the tool is
    // a pure catalog query.
    assert.equal(SearchProductsArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1' }).success, false);
    assert.equal(
      SearchProductsArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1', productId: 'p1' }).success,
      false,
    );
  });

  it('selectProduct requires either productId or productName', () => {
    const byId = SelectProductArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1', productId: 'prod_1' });
    const byName = SelectProductArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1', productName: 'iPhone' });
    assert.equal(byId.success, true);
    assert.equal(byName.success, true);
    assert.equal(SelectProductArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1' }).success, false);
  });

  it('getProductDetails requires either productId or productName', () => {
    const byName = GetProductDetailsArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1', productName: 'iPhone' });
    const byId = GetProductDetailsArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1', productId: 'prod_1' });
    assert.equal(byName.success, true);
    assert.equal(byId.success, true);
    assert.equal(GetProductDetailsArgsSchema.safeParse({ merchantId: 'm1', conversationId: 'c1' }).success, false);
  });

  it('confirmOrder requires an explicit orderId plus identity — no state keys', () => {
    const parsed = ConfirmOrderArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      conversationId: 'conv_1',
      orderId: 'ord_1',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.orderId, 'ord_1');
      // No implicit-confirmation gate keys — the tool is state-free.
      assert.equal('conversationState' in parsed.data, false);
      assert.equal('currentOrderId' in parsed.data, false);
      assert.equal('productName' in parsed.data, false);
    }
    // orderId is required; the transport materializes it from currentOrderId.
    const missingOrder = ConfirmOrderArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1', conversationId: 'conv_1' });
    assert.equal(missingOrder.success, false);
  });

  it('escalateConversation requires identity + an explicit reason', () => {
    const paths = failedPaths(EscalateConversationArgsSchema, {});
    assert.deepEqual(new Set(paths), new Set(['merchantId', 'customerId', 'conversationId', 'reason']));
    const parsed = EscalateConversationArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      conversationId: 'conv_1',
      reason: 'Conflit de livraison',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.reason, 'Conflit de livraison');
    assert.equal(
      EscalateConversationArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1', conversationId: 'conv_1' }).success,
      false,
    );
  });

  it('createOrder requires productId, quantity, wilaya, commune plus identity', () => {
    const parsed = CreateOrderArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      conversationId: 'conv_1',
      productId: 'prod_1',
      quantity: 2,
      wilaya: 'Alger',
      commune: 'Bab Ezzouar',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.productId, 'prod_1');

    // No product-id fallback: the product NAME is not accepted — order tools
    // are context-free, productId must be explicit.
    assert.equal(
      CreateOrderArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1', conversationId: 'conv_1', product: 'iPhone', quantity: 1, wilaya: 'Alger', commune: 'Bab Ezzouar' }).success,
      false,
    );
    // No wilaya/commune/quantity → rejected.
    assert.equal(
      CreateOrderArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1', conversationId: 'conv_1', productId: 'prod_1' }).success,
      false,
    );
    // quantity has no default — must be explicit.
    assert.equal(
      CreateOrderArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1', conversationId: 'conv_1', productId: 'prod_1', wilaya: 'Alger', commune: 'Bab Ezzouar' }).success,
      false,
    );
  });

  it('cancelOrder requires an explicit orderId plus identity', () => {
    const parsed = CancelOrderArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      conversationId: 'conv_1',
      orderId: 'ord_1',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.orderId, 'ord_1');
      assert.equal('productName' in parsed.data, false);
    }
    const missingOrder = CancelOrderArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1', conversationId: 'conv_1' });
    assert.equal(missingOrder.success, false);
  });

  it('suggestProducts no longer consumes memory — accepts injected excludedProductIds', () => {
    const parsed = SuggestProductsArgsSchema.safeParse({
      merchantId: 'm1',
      conversationId: 'conv_1',
      excludedProductIds: '["p1"]',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      // memory is no longer part of the schema and must be dropped.
      assert.equal('memory' in parsed.data, false);
      assert.equal('productId' in parsed.data, false);
      assert.equal(parsed.data.excludedProductIds, '["p1"]');
    }
  });

  it('calculateShipping requires an explicit wilaya plus the injected merchantId', () => {
    const parsed = CalculateShippingArgsSchema.safeParse({ merchantId: 'm1', wilaya: 'Alger' });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.wilaya, 'Alger');
      // Only public + injected identity keys — no commune/address leakage.
      assert.equal('commune' in parsed.data, false);
    }
    // No wilaya → invalid even with identity.
    assert.equal(CalculateShippingArgsSchema.safeParse({ merchantId: 'm1' }).success, false);
    // No identity → invalid even with a wilaya.
    assert.equal(CalculateShippingArgsSchema.safeParse({ wilaya: 'Alger' }).success, false);
  });

  it('getOrderStatus requires an explicit orderId plus identity', () => {
    const parsed = GetOrderStatusArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      orderId: 'ord_1',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.orderId, 'ord_1');

    // orderId is required — no implicit-current-order fallback in the schema;
    // the transport materializes it before dispatch.
    const missingId = GetOrderStatusArgsSchema.safeParse({ merchantId: 'm1', customerId: 'c1' });
    assert.equal(missingId.success, false);
    const missingCustomer = GetOrderStatusArgsSchema.safeParse({ merchantId: 'm1', orderId: 'ord_1' });
    assert.equal(missingCustomer.success, false);
  });
});