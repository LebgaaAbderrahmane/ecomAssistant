import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  SearchProductsArgsSchema,
  RecallPreviousProductsArgsSchema,
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
  recallPreviousProducts: RecallPreviousProductsArgsSchema,
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
    assert.equal(TOOL_NAMES.length, 12);
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

  it('confirmOrder keeps the implicit-confirmation keys (currentOrderId + conversationState)', () => {
    const parsed = ConfirmOrderArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      conversationId: 'conv_1',
      currentOrderId: 'ord_1',
      conversationState: 'WAITING_CONFIRMATION',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.currentOrderId, 'ord_1');
      assert.equal(parsed.data.conversationState, 'WAITING_CONFIRMATION');
    }
  });

  it('escalateConversation is purely transport-injected identity', () => {
    const paths = failedPaths(EscalateConversationArgsSchema, {});
    assert.deepEqual(new Set(paths), new Set(['merchantId', 'customerId', 'conversationId']));
    const parsed = EscalateConversationArgsSchema.safeParse({
      merchantId: 'm1',
      customerId: 'c1',
      conversationId: 'conv_1',
    });
    assert.equal(parsed.success, true);
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
});