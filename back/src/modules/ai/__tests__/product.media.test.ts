import { describe, it, expect, vi } from 'vitest';

vi.mock('../../whatsapp/whatsapp.service', () => ({
  openwaService: { sendImage: vi.fn() },
}));

import { collectProductCards, customerRequestedImages } from '../outbound/product.media';
import type { ToolResultEntry } from '../execution/execution.types';

describe('collectProductCards', () => {
  it('collects every image from a getProductDetails result', () => {
    const toolResults: ToolResultEntry[] = [
      {
        intent: 'PRODUCT_DETAILS',
        result: {
          success: true,
          data: {
            productId: 'p1',
            productName: 'Serwal',
            price: 2500,
            currency: 'DZD',
            productImages: ['https://img/1.jpg', 'https://img/2.jpg', 'https://img/3.jpg'],
          },
        },
      },
    ];

    const cards = collectProductCards(toolResults);
    expect(cards).toHaveLength(3);
    expect(cards[0]).toEqual({ id: 'p1', name: 'Serwal', price: 2500, currency: 'DZD', image: 'https://img/1.jpg' });
    expect(cards[1].image).toBe('https://img/2.jpg');
    expect(cards[2].image).toBe('https://img/3.jpg');
  });

  it('skips non-string / empty productImages', () => {
    const toolResults: ToolResultEntry[] = [
      {
        intent: 'PRODUCT_DETAILS',
        result: {
          success: true,
          data: { productId: 'p1', productName: 'X', price: 1, currency: 'DZD', productImages: ['', 42, 'https://ok.jpg'] },
        },
      },
    ];
    const cards = collectProductCards(toolResults);
    expect(cards).toHaveLength(1);
    expect(cards[0].image).toBe('https://ok.jpg');
  });

  it('returns no cards when getProductDetails has no images', () => {
    const toolResults: ToolResultEntry[] = [
      {
        intent: 'PRODUCT_DETAILS',
        result: { success: true, data: { productId: 'p1', productName: 'X', price: 1, productImages: [] } },
      },
    ];
    expect(collectProductCards(toolResults)).toHaveLength(0);
  });

  it('collects every image per product from a productCards search result', () => {
    const toolResults: ToolResultEntry[] = [
      {
        intent: 'PRODUCT_SEARCH',
        result: {
          success: true,
          data: {
            productCards: [
              { id: 'p1', name: 'Shoes Pro', price: 5000, currency: 'DZD', images: ['https://img/a.jpg', 'https://img/b.jpg'] },
              { id: 'p2', name: 'Shoes Lite', price: 3000, currency: 'DZD', images: ['https://img/c.jpg'] },
            ],
          },
        },
      },
    ];
    const cards = collectProductCards(toolResults);
    expect(cards).toHaveLength(3);
    expect(cards.map(c => c.image)).toEqual([
      'https://img/a.jpg',
      'https://img/b.jpg',
      'https://img/c.jpg',
    ]);
  });

  it('ignores legacy productCards entries carrying a single image field (image not images)', () => {
    const toolResults: ToolResultEntry[] = [
      {
        intent: 'PRODUCT_SEARCH',
        result: { success: true, data: { productCards: [{ id: 'p1', name: 'X', price: 1, image: 'https://legacy.jpg' }] } },
      },
    ];
    expect(collectProductCards(toolResults)).toHaveLength(0);
  });

  it('returns an empty array when there are no tool results', () => {
    expect(collectProductCards([])).toEqual([]);
  });
});

describe('customerRequestedImages', () => {
  it('detects explicit photo requests in English', () => {
    expect(customerRequestedImages('can you send a picture')).toBe(true);
    expect(customerRequestedImages('show me the photo please')).toBe(true);
  });

  it('detects explicit photo requests in French', () => {
    expect(customerRequestedImages('envoyez la photo svp')).toBe(true);
    expect(customerRequestedImages('montre-moi une image')).toBe(true);
  });

  it('detects explicit photo requests in Arabic', () => {
    expect(customerRequestedImages('ابعتلي صورة')).toBe(true);
    expect(customerRequestedImages('صور المنتج')).toBe(true);
  });

  it('does not flag plain details queries', () => {
    expect(customerRequestedImages('how much is it')).toBe(false);
    expect(customerRequestedImages('كم ثمنه')).toBe(false);
  });
});
