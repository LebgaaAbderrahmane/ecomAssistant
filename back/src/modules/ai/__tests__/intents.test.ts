import { describe, it, expect } from 'vitest';
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
    expect(IntentSchema.options).toContain('PRODUCT_SUGGEST');
    expect(ReadToolNameSchema.options).toContain('suggestProducts');
  });

  it('maps PRODUCT_SUGGEST deterministically to suggestProducts', () => {
    expect(resolveTool('PRODUCT_SUGGEST', {})).toBe('suggestProducts');
    expect(resolveTool('PRODUCT_SUGGEST', { category: 'shoes' })).toBe('suggestProducts');
  });

  it('routes PRODUCT_SEARCH to searchProducts when a product reference is present', () => {
    expect(resolveTool('PRODUCT_SEARCH', { product: 'iphone 15' })).toBe('searchProducts');
    expect(resolveTool('PRODUCT_SEARCH', { productName: 'shoes' })).toBe('searchProducts');
  });

  it('routes PRODUCT_SEARCH to recallPreviousProducts when no product reference is present', () => {
    expect(resolveTool('PRODUCT_SEARCH', {})).toBe('recallPreviousProducts');
  });

  it('does not route other intents to suggestProducts', () => {
    expect(resolveTool('PRODUCT_SELECT', { productIndex: 1 })).toBe('selectProduct');
    expect(resolveTool('PRODUCT_DETAILS', { productName: 'x' })).toBe('getProductDetails');
    expect(resolveTool('ORDER_CREATE', {})).toBe('createOrder');
  });
});

describe('tool execution policies (read / write)', () => {
  const READ_TOOLS = ReadToolNameSchema.options;
  const WRITE_TOOLS = WriteToolNameSchema.options;
  const ALL_TOOLS = [...READ_TOOLS, ...WRITE_TOOLS];

  it('every tool has exactly one execution policy', () => {
    const readSet = new Set<string>(READ_TOOLS);
    const writeSet = new Set<string>(WRITE_TOOLS);

    for (const tool of ALL_TOOLS) {
      expect(isReadTool(tool)).toBe(readSet.has(tool));
      expect(isWriteTool(tool)).toBe(writeSet.has(tool));
      expect(isReadTool(tool)).not.toBe(isWriteTool(tool));
    }

    expect(ALL_TOOLS.length).toBe(new Set(ALL_TOOLS).size);
    const overlaps = READ_TOOLS.filter((t) => writeSet.has(t));
    expect(overlaps.length).toBe(0);
  });

  it('classifies the navigation tools as READ', () => {
      for (const tool of ['searchProducts', 'recallPreviousProducts', 'selectProduct', 'getProductDetails', 'suggestProducts', 'calculateShipping', 'getOrderStatus'] as const) {
      expect(isReadTool(tool)).toBe(true);
      expect(isWriteTool(tool)).toBe(false);
    }
  });

  it('classifies the business-mutating tools as WRITE', () => {
    for (const tool of ['createOrder', 'confirmOrder', 'modifyOrder', 'cancelOrder', 'escalateConversation'] as const) {
      expect(isWriteTool(tool)).toBe(true);
      expect(isReadTool(tool)).toBe(false);
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
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.category).toBe('sneakers');
      expect(parsed.data.maxPrice).toBe(8000);
    }
  });

  it('accepts an empty object (recommend with no prior context)', () => {
    expect(SuggestProductsArgsSchema.safeParse({}).success).toBe(true);
  });

  it('rejects negative prices', () => {
    expect(SuggestProductsArgsSchema.safeParse({ maxPrice: -5 }).success).toBe(false);
  });
});
