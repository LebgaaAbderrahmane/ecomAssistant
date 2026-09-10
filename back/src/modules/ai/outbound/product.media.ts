import type { Prisma } from '@prisma/client';
import { msgLogger } from '../../../lib/logger';
import { openwaService } from '../../whatsapp/whatsapp.service';
import type { ImageCategory } from '../media/imageCaption.service';
import type { ToolResultEntry } from '../execution/execution.types';

// ─── Image category routing ─────────────────────────────────────────────
// If the message is an image, route by category before LLM #1 sees it.
// The description is already in message.content from the captioning service.
export function buildEffectiveText(message: {
  messageType: string;
  entities: Prisma.JsonValue | null;
  text: string;
}): string {
  let effectiveText = message.text;

  if (message.messageType === 'image') {
    const entities = (message.entities as Record<string, unknown>) ?? {};
    const category = entities.imageCategory as ImageCategory | undefined;
    const productName = entities.productName as string | null;

    if (category === 'PAYMENT_PROOF' || category === 'DAMAGE_COMPLAINT') {
      // Escalate directly — human agent can view the image in WhatsApp
      effectiveText = `[Image received: ${category === 'PAYMENT_PROOF' ? 'payment proof' : 'damage complaint'}] ${message.text}`;
    } else if (category === 'PRODUCT_PHOTO') {
      // Prepend image context so LLM #1 sees a rich query for PRODUCT_SEARCH
      const namePart = productName ? ` (product: ${productName})` : '';
      effectiveText = `[Customer sent a photo${namePart}] ${message.text}`;
    }
    // OTHER or uncategorized: fall through with effectiveText = message.text
  }

  return effectiveText;
}

export type ProductCard = {
  id: string;
  name: string;
  price: number;
  currency: string;
  image?: string;
};

/** Collects image cards from tool results so each product image can be sent as
 *  its own WhatsApp message. Handles two shapes:
 *   - search/select results carrying a `productCards` array (each with an
 *     `images` array of URLs), and
 *   - a single `getProductDetails` result carrying `productImages`.
 *  One card is produced per image; products/messages without an image are
 *  skipped (the text reply still surfaces them). */
export function collectProductCards(toolResults: ToolResultEntry[]): ProductCard[] {
  const cards: ProductCard[] = [];

  const pushImage = (
    id: unknown,
    name: unknown,
    price: unknown,
    currency: unknown,
    image: string,
  ) => {
    cards.push({
      id: String(id),
      name: String(name),
      price: Number(price),
      currency: String(currency ?? 'DZD'),
      image,
    });
  };

  for (const tr of toolResults) {
    const data = tr.result?.data;
    if (!data) continue;

    // Single-product details: productImages is an array of URL strings. The
    // price may be absent when the customer asked only for a photo, so the
    // card falls back to a safe 0 rather than an invalid NaN.
    if (Array.isArray(data.productImages)) {
      for (const img of data.productImages as unknown[]) {
        if (typeof img === 'string' && img) {
          const priceNum =
            typeof data.price === 'number' && Number.isFinite(data.price) ? data.price : 0;
          pushImage(data.productId, data.productName, priceNum, data.currency, img);
        }
      }
    }

    // Multi-product results: productCards arrays, each with an images array.
    if (Array.isArray(data.productCards)) {
      for (const c of data.productCards as unknown[]) {
        const card = c as Partial<ProductCard> & { images?: unknown };
        const images = Array.isArray(card.images)
          ? (card.images as unknown[]).filter((u): u is string => typeof u === 'string' && !!u)
          : [];
        for (const img of images) {
          pushImage(card.id, card.name, card.price, card.currency, img);
        }
      }
    }
  }

  return cards;
}

/**
 * Detects whether the customer explicitly asked for a product photo/picture.
 * Product details are only accompanied by an image message when the customer
 * actually wanted to see it — not on every details query (e.g. "how much?").
 */
const IMAGE_REQUEST_PATTERN =
  /(photo|pictur|image|صور|صورة|صوّر|montre\s*-?\s*(moi)?|show\s*(me)?)/i;

export function customerRequestedImages(text: string): boolean {
  if (!text) return false;
  return IMAGE_REQUEST_PATTERN.test(text);
}

const PRODUCT_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
const PRODUCT_IMAGE_TIMEOUT_MS = 15_000;

/** Downloads a remote product image and returns it as base64 + mimetype for
 *  direct WhatsApp upload. Sending base64 avoids relying on OpenWA's own
 *  remote fetch, which refuses HTTP redirects that Shopify's CDN commonly
 *  returns — the cause of product images never arriving. Returns null on any
 *  download/parse failure so the caller can fall back gracefully. */
export async function downloadProductImage(url: string): Promise<{ base64: string; mimetype: string } | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(PRODUCT_IMAGE_TIMEOUT_MS),
    });
    if (!res.ok) {
      return null;
    }
    const blob = await res.blob();
    if (!blob || blob.size === 0 || blob.size > PRODUCT_IMAGE_MAX_BYTES) {
      return null;
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    const mimetype = (res.headers.get('content-type') ?? '').split(';')[0].trim() || 'image/jpeg';
    return { base64: buf.toString('base64'), mimetype };
  } catch {
    return null;
  }
}

/** Sends each product card's image as its own WhatsApp message. Each image is
 *  downloaded locally and sent as base64 (more reliable than handing OpenWA a
 *  remote URL). A product whose image fails to download is skipped — the text
 *  reply still surfaces the product. The image carries no caption: product
 *  details are conveyed by the text reply, so captions would be redundant. */
export async function sendProductImages(
  waSessionId: string,
  to: string,
  cards: ProductCard[],
  log: ReturnType<typeof msgLogger>,
): Promise<void> {
  for (const c of cards) {
    const image = c.image as string;
    const media = await downloadProductImage(image);
    try {
      if (media) {
        await openwaService.sendImage(waSessionId, to, {
          base64: media.base64,
          mimetype: media.mimetype,
        });
      } else {
        // Fall back to the URL so OpenWA's own fetch has a chance.
        await openwaService.sendImage(waSessionId, to, {
          url: image,
        });
      }
    } catch (err) {
      log.warn({ err, productId: c.id, image }, 'failed to send product image');
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
