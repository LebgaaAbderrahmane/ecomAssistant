import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IntentSchema,
  ToolNameSchema,
  resolveTool,
  SuggestProductsArgsSchema,
} from '../schemas/intents.schemas';

describe('suggestProducts intent routing', () => {
  it('exposes PRODUCT_SUGGEST as a covered intent and suggestProducts as a tool', () => {
    assert.ok(IntentSchema.options.includes('PRODUCT_SUGGEST'));
    assert.ok(ToolNameSchema.options.includes('suggestProducts'));
  });

  it('maps PRODUCT_SUGGEST deterministically to suggestProducts', () => {
    assert.equal(resolveTool('PRODUCT_SUGGEST', {}), 'suggestProducts');
    assert.equal(resolveTool('PRODUCT_SUGGEST', { category: 'shoes' }), 'suggestProducts');
  });

  it('does not route other intents to suggestProducts', () => {
    assert.equal(resolveTool('PRODUCT_SEARCH', { product: 'iphone 15' }), 'searchProducts');
    assert.equal(resolveTool('PRODUCT_SELECT', { productIndex: 1 }), 'chooseProduct');
    assert.equal(resolveTool('PRODUCT_DETAILS', { productName: 'x' }), 'getProductDetails');
    assert.equal(resolveTool('ORDER_CREATE', {}), 'createOrder');
  });
});

describe('SuggestProductsArgsSchema', () => {
  it('accepts preference entities', () => {
    const parsed = SuggestProductsArgsSchema.safeParse({
      category: 'sneakers',
      color: 'black',
      size: '42',
      minPrice: 0,
      maxPrice: 8000,
      preferences: 'running, light',
    });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.category, 'sneakers');
      assert.equal(parsed.data.maxPrice, 8000);
    }
  });

  it('accepts an empty object (recommend with no prior context)', () => {
    assert.equal(SuggestProductsArgsSchema.safeParse({}).success, true);
  });

  it('rejects negative prices', () => {
    assert.equal(SuggestProductsArgsSchema.safeParse({ maxPrice: -5 }).success, false);
  });
});
