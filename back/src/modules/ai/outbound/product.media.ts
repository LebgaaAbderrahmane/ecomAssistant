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

/** Collects per-product image cards from search tool results so each search
 *  result can be sent as its own image message. Products without an image are
 *  skipped (the text reply still surfaces them). */
export function collectProductCards(toolResults: ToolResultEntry[]): ProductCard[] {
  const cards: ProductCard[] = [];
  for (const tr of toolResults) {
    const data = tr.result?.data;
    if (data && Array.isArray(data.productCards)) {
      for (const c of data.productCards as unknown[]) {
        const card = c as Partial<ProductCard>;
        if (card && typeof card.image === 'string' && card.image) {
          cards.push({
            id: String(card.id),
            name: String(card.name),
            price: Number(card.price),
            currency: String(card.currency ?? 'DZD'),
            image: card.image,
          });
        }
      }
    }
  }
  return cards;
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
 *  reply still surfaces it. */
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
          caption: `${c.name} — ${c.price} ${c.currency}`,
        });
      } else {
        // Fall back to the URL so OpenWA's own fetch has a chance.
        await openwaService.sendImage(waSessionId, to, {
          url: image,
          caption: `${c.name} — ${c.price} ${c.currency}`,
        });
      }
    } catch (err) {
      log.warn({ err, productId: c.id, image }, 'failed to send product image');
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}
