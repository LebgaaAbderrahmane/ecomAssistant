import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  IntentSchema,
  ToolNameSchema,
  ReadToolNameSchema,
  WriteToolNameSchema,
  isReadTool,
  isWriteTool,
  resolveTool,
  SuggestProductsArgsSchema,
} from '../schemas/intents.schemas';

describe('suggestProducts intent routing', () => {
  it('exposes PRODUCT_SUGGEST as a covered intent and suggestProducts as a tool', () => {
    assert.ok(IntentSchema.options.includes('PRODUCT_SUGGEST'));
    assert.ok(ReadToolNameSchema.options.includes('suggestProducts'));
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

describe('tool execution policies (read / write)', () => {
  const READ_TOOLS = ReadToolNameSchema.options;
  const WRITE_TOOLS = WriteToolNameSchema.options;
  const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

  it('every tool has exactly one execution policy', () => {
    const readSet = new Set(READ_TOOLS);
    const writeSet = new Set(WRITE_TOOLS);

    for (const tool of ALL_TOOLS) {
      assert.equal(isReadTool(tool), readSet.has(tool), `${tool} isReadTool mismatch`);
      assert.equal(isWriteTool(tool), writeSet.has(tool), `${tool} isWriteTool mismatch`);
      assert.notEqual(isReadTool(tool), isWriteTool(tool), `${tool} must be read XOR write`);
    }

    // Union must be exhaustive and non-overlapping.
    assert.equal(ALL_TOOLS.length, new Set(ALL_TOOLS).size, 'tools must not be duplicated');
    const overlaps = READ_TOOLS.filter((t) => writeSet.has(t));
    assert.equal(overlaps.length, 0, `overlapping tools: ${overlaps.join(', ')}`);
  });

  it('classifies the navigation tools as READ', () => {
    for (const tool of ['searchProducts', 'recallPreviousProducts', 'chooseProduct', 'getProductDetails', 'suggestProducts', 'calculateShipping', 'getOrderStatus']) {
      assert.equal(isReadTool(tool), true, `${tool} should be READ`);
      assert.equal(isWriteTool(tool), false, `${tool} should not be WRITE`);
    }
  });

  it('classifies the business-mutating tools as WRITE', () => {
    for (const tool of ['createOrder', 'confirmOrder', 'modifyOrder', 'cancelOrder', 'escalateConversation']) {
      assert.equal(isWriteTool(tool), true, `${tool} should be WRITE`);
      assert.equal(isReadTool(tool), false, `${tool} should not be READ`);
    }
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
