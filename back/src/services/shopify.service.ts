// src/services/shopify.service.ts
import crypto from "crypto";
import axios from "axios";
import prisma from "../config/db.config";
import { redis } from "../config";

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  SHOPIFY_SCOPES,
  APP_URL,
  ENCRYPTION_KEY,
} = process.env;

const NONCE_TTL = 600; // 10 minutes

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface NoncePayload {
  merchantId: string;
  shop: string;
}

interface ShopifyProduct {
  id: number;
  title: string;
  body_html: string;
  vendor: string;
  product_type: string;
  status: string;
  variants: { id: number; price: string; title: string; inventory_quantity: number }[];
  images: { src: string }[];
}

interface ShopifyOrder {
  id: number;
  order_number: number;
  customer: { first_name: string; last_name: string; phone: string } | null;
  total_price: string;
  financial_status: string;
  fulfillment_status: string | null;
  line_items: { title: string; quantity: number; price: string }[];
  shipping_address: { address1: string; city: string; province: string } | null;
  created_at: string;
}


// ─────────────────────────────────────────────
// Nonce — stored in Redis (consistent with auth pattern)
// ─────────────────────────────────────────────

export const generateInstallUrl = async (
  shop: string,
  merchantId: string
): Promise<string> => {
  // Validate shop domain to prevent open redirect
  if (!/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/.test(shop)) {
    throw new Error("Invalid shop domain");
  }

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } });
  if (!merchant) throw new Error("Merchant not found");

  const nonce = crypto.randomBytes(16).toString("hex");
  await redis.set(
    `shopify-nonce:${nonce}`,
    JSON.stringify({ merchantId, shop } satisfies NoncePayload),
    { EX: NONCE_TTL }
  );

  const redirectUri = `${APP_URL}/shopify/callback`;

  console.log(`https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SHOPIFY_SCOPES}` +
    `&redirect_uri=${redirectUri}` +
    `&state=${nonce}`)

  return (
    `https://${shop}/admin/oauth/authorize` +
    `?client_id=${SHOPIFY_API_KEY}` +
    `&scope=${SHOPIFY_SCOPES}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${nonce}`
  );
};

export const consumeNonce = async (
  nonce: string,
  shop: string
): Promise<NoncePayload> => {
  const key = `shopify-nonce:${nonce}`;
  const raw = await redis.get(key);

  if (!raw) throw new Error("State token expired or invalid");

  const payload: NoncePayload = JSON.parse(raw);

  if (payload.shop !== shop) throw new Error("State token shop mismatch");

  await redis.del(key); // one-time use
  return payload;
};

// ─────────────────────────────────────────────
// HMAC verification
// ─────────────────────────────────────────────

export const verifyHmac = (query: Record<string, string>): boolean => {
  const { hmac, ...rest } = query;

  if (!hmac) return false;

  // Sanitize: remove any undefined/null values
  const filtered = Object.fromEntries(
    Object.entries(rest).filter(([_, v]) => v !== undefined && v !== null)
  );

  const message = Object.keys(filtered)
    .sort()
    .map((k) => `${k}=${filtered[k]}`)
    .join("&");

  console.log("HMAC message string:", message); // ← add this

  const generated = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET!)
    .update(message)
    .digest("hex");

  console.log("Generated HMAC:", generated);
  console.log("Received HMAC:", hmac);

  try {
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmac));
  } catch {
    return false;
  }
};

export const verifyWebhookHmac = (rawBody: Buffer, hmacHeader: string): boolean => {
  const generated = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET!)
    .update(rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────
// Token exchange + encryption
// ─────────────────────────────────────────────

export const exchangeCodeForToken = async (
  shop: string,
  code: string
): Promise<{ access_token: string; scope: string }> => {
  const response = await axios.post(`https://${shop}/admin/oauth/access_token`, {
    client_id: SHOPIFY_API_KEY,
    client_secret: SHOPIFY_API_SECRET,
    code,
  });
  return response.data;
};

const encryptToken = (token: string): string => {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync("temp_test_key_123", "salt", 32); // ← hardcoded
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
  const encrypted = Buffer.concat([cipher.update(token), cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

export const decryptToken = (encryptedToken: string): string => {
  const [ivHex, encryptedHex] = encryptedToken.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const key = crypto.scryptSync("temp_test_key_123", "salt", 32); // ← hardcoded
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
};
// ─────────────────────────────────────────────
// StoreConnection — Prisma (uses your existing model)
// ─────────────────────────────────────────────

export const saveStoreConnection = async (
  merchantId: string,
  shop: string,
  accessToken: string,
  scope: string
): Promise<void> => {
  const encryptedToken = encryptToken(accessToken);

  const existing = await prisma.storeConnection.findFirst({
    where: { merchantId },
  });

  if (existing) {
    await prisma.storeConnection.update({
      where: { id: existing.id },
      data: {
        storeName: shop,
        storeUrl: `https://${shop}`,
        shopifyDomain: shop,
        accessToken: encryptedToken,
        scopes: scope,
        platform: "SHOPIFY",
        updatedAt: new Date(),
      },
    });
  } else {
    await prisma.storeConnection.create({
      data: {
        merchantId,
        platform: "SHOPIFY",
        storeName: shop,
        storeUrl: `https://${shop}`,
        shopifyDomain: shop,
        accessToken: encryptedToken,
        scopes: scope,
      },
    });
  }
};

export const disconnectStore = async (merchantId: string): Promise<void> => {
  const connection = await prisma.storeConnection.findFirst({
    where: { merchantId },
  });

  if (!connection) throw new Error("No store connection found");

  await prisma.storeConnection.delete({ where: { id: connection.id } });
};

export const getStoreConnection = async (merchantId: string) => {
  const connection = await prisma.storeConnection.findFirst({
    where: { merchantId, platform: "SHOPIFY" },
  });

  if (!connection) throw new Error("No Shopify store connected");
  return connection;
};

// ─────────────────────────────────────────────
// Product + Order sync → maps to your Prisma schema
// ─────────────────────────────────────────────

export const syncShopData = async (
  merchantId: string,
  shop: string,
  accessToken: string
): Promise<void> => {
  const headers = { "X-Shopify-Access-Token": accessToken };
  const base = `https://${shop}/admin/api/2026-04`;

  // Sync products
  let productUrl: string | null = `${base}/products.json?limit=250`;
  while (productUrl) {
    const { data, headers: resHeaders } = await axios.get(productUrl, { headers });
    await upsertProducts(merchantId, data.products);
    productUrl = extractNextPageUrl(resHeaders["link"]);
  }

  // Sync orders
  let orderUrl: string | null = `${base}/orders.json?limit=250&status=any`;
  while (orderUrl) {
    const { data, headers: resHeaders } = await axios.get(orderUrl, { headers });
    await upsertOrders(merchantId, data.orders);
    orderUrl = extractNextPageUrl(resHeaders["link"]);
  }

  console.log(`✅ Sync complete for ${shop}`);
};

const upsertProducts = async (
  merchantId: string,
  products: ShopifyProduct[]
): Promise<void> => {
  for (const p of products) {
    const price = parseFloat(p.variants?.[0]?.price ?? "0");
    const images = p.images.map((img) => img.src);
    const stockStatus =
      (p.variants?.[0]?.inventory_quantity ?? 0) > 0 ? "in_stock" : "out_of_stock";

    await prisma.product.upsert({
      where: {
        merchantId_platformProductId: {
          merchantId,
          platformProductId: String(p.id),
        },
      },
      update: {
        name: p.title,
        description: p.body_html ?? "",
        price,
        images,
        variants: p.variants as any,
        stockStatus,
        category: p.product_type || null,
      },
      create: {
        merchantId,
        platformProductId: String(p.id),
        name: p.title,
        description: p.body_html ?? "",
        price,
        currency: "DZD",
        images,
        variants: p.variants as any,
        stockStatus,
        category: p.product_type || null,
      },
    });
  }
};

export const upsertOrders = async (
  merchantId: string,
  orders: ShopifyOrder[]
): Promise<void> => {
  for (const o of orders) {
    const existing = await prisma.order.findFirst({
      where: { merchantId, platformOrderId: String(o.id) },
    });

    if (existing) {
      await prisma.order.update({
        where: { id: existing.id },
        data: { status: mapFinancialStatus(o.financial_status) },
      });
      continue;
    }

    const firstItem = o.line_items[0];
    if (!firstItem) continue;

    const customerName = o.customer
      ? `${o.customer.first_name} ${o.customer.last_name}`.trim()
      : "Unknown";
    const customerPhone = o.customer?.phone ?? "";
    const wilaya = o.shipping_address?.province ?? "";
    const address = o.shipping_address?.address1 ?? "";

    const product = await prisma.product.findFirst({
      where: { merchantId, name: firstItem.title },
    });

    if (!product) continue;

    await prisma.order.create({
      data: {
        merchantId,
        platformOrderId: String(o.id),
        customerName,
        customerPhone,
        wilaya,
        commune: o.shipping_address?.city ?? null,
        address,
        productId: product.id,
        productName: firstItem.title,
        quantity: firstItem.quantity,
        totalAmount: parseFloat(o.total_price),
        status: mapFinancialStatus(o.financial_status),
      },
    });
  }
};

const mapFinancialStatus = (status: string): string => {
  const map: Record<string, string> = {
    pending: "pending",
    authorized: "pending",
    paid: "confirmed",
    partially_paid: "pending",
    refunded: "cancelled",
    voided: "cancelled",
  };
  return map[status] ?? "pending";
};

// ─────────────────────────────────────────────
// Webhook registration
// ─────────────────────────────────────────────

export const registerWebhook = async (
  shop: string,
  accessToken: string
): Promise<void> => {
  await axios.post(
    `https://${shop}/admin/api/2024-01/webhooks.json`,
    {
      webhook: {
        topic: "orders/create",
        address: `${APP_URL}/shopify/webhooks/orders`,
        format: "json",
      },
    },
    { headers: { "X-Shopify-Access-Token": accessToken } }
  );
};

const extractNextPageUrl = (linkHeader: string | undefined): string | null => {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
};

// Add this helper method inside your services/shopify.service.ts file:

export const getStoreConnectionByShop = async (shop: string) => {
  const connection = await prisma.storeConnection.findFirst({
    where: { shopifyDomain: shop, platform: "SHOPIFY" },
  });

  if (!connection) throw new Error(`No store connection found for domain ${shop}`);
  return connection;
};