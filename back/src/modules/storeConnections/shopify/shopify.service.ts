import crypto from "crypto";
import axios from "axios";
import prisma from "../../../config/db.config";
import { redis } from "../../../config";
import { StoreConnectionFactory } from "../../../connections/StoreConnectionFactory";
import { getOrders } from "../../orders/orders.service";
import { PaginatedResult } from "../../../types/pagination.types";
import { Order } from "@prisma/client";

const {
  SHOPIFY_API_KEY,
  SHOPIFY_API_SECRET,
  APP_URL,
} = process.env;

const NONCE_TTL = 600;

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface NoncePayload {
  merchantId: string;
  shop: string;
}

// ─────────────────────────────────────────────
// Nonce
// ─────────────────────────────────────────────

export const generateNonce = async (
  shop: string,
  merchantId: string
): Promise<string> => {
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

  return nonce;
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

  await redis.del(key);
  return payload;
};

// ─────────────────────────────────────────────
// HMAC verification (OAuth query params)
// ─────────────────────────────────────────────

export const verifyHmac = (query: Record<string, string>): boolean => {
  const { hmac, ...rest } = query;

  if (!hmac) return false;

  const filtered = Object.fromEntries(
    Object.entries(rest).filter(([_, v]) => v !== undefined && v !== null)
  );

  const message = Object.keys(filtered)
    .sort()
    .map((k) => `${k}=${filtered[k]}`)
    .join("&");

  const generated = crypto
    .createHmac("sha256", SHOPIFY_API_SECRET!)
    .update(message)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(hmac));
  } catch {
    return false;
  }
};

// ─────────────────────────────────────────────
// Token exchange
// ─────────────────────────────────────────────

export const exchangeCodeForToken = async (
  shop: string,
  code: string
): Promise<{
  access_token: string;
  scope: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}> => {
  const params = new URLSearchParams({
    client_id: SHOPIFY_API_KEY!,
    client_secret: SHOPIFY_API_SECRET!,
    code,
    expiring: "1",
  });

  const response = await axios.post(
    `https://${shop}/admin/oauth/access_token`,
    params.toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  return response.data;
};

// ─────────────────────────────────────────────
// StoreConnection DB operations
// ─────────────────────────────────────────────

export const saveStoreConnection = async (
  merchantId: string,
  shop: string,
  accessToken: string,
  scope: string,
  expiresIn?: number,
  refreshToken?: string,
  refreshTokenExpiresIn?: number
): Promise<string> => {
  const { encryptToken } = await import("../../../lib/crypto");

  const encryptedToken = encryptToken(accessToken);
  const encryptedRefreshToken = refreshToken ? encryptToken(refreshToken) : null;

  const now = new Date();
  const tokenExpiresAt = expiresIn
    ? new Date(now.getTime() + expiresIn * 1000)
    : null;
  const refreshTokenExpiresAt = refreshTokenExpiresIn
    ? new Date(now.getTime() + refreshTokenExpiresIn * 1000)
    : null;

  // Check if a StoreConnection already exists for this merchant + shop
  const existingStore = await prisma.storeConnection.findFirst({
    where: { merchantId },
    include: { shopifyConnection: true },
  });

  if (existingStore) {
    await prisma.shopifyConnection.update({
      where: { storeConnectionId: existingStore.id },
      data: {
        accessToken: encryptedToken,
        scopes: scope,
        ...(encryptedRefreshToken && { refreshToken: encryptedRefreshToken }),
        ...(tokenExpiresAt && { tokenExpiresAt }),
        ...(refreshTokenExpiresAt && { refreshTokenExpiresAt }),
      },
    });

    await prisma.storeConnection.update({
      where: { id: existingStore.id },
      data: { isActive: true, updatedAt: now },
    });

    return existingStore.id;
  }

  // Create new StoreConnection + ShopifyConnection
  const storeConnection = await prisma.storeConnection.create({
    data: {
      merchantId,
      source: "SHOPIFY",
      storeName: shop,
      storeUrl: `https://${shop}`,
      isActive: true,
      shopifyConnection: {
        create: {
          shopDomain: shop,
          accessToken: encryptedToken,
          scopes: scope,
          ...(encryptedRefreshToken && { refreshToken: encryptedRefreshToken }),
          ...(tokenExpiresAt && { tokenExpiresAt }),
          ...(refreshTokenExpiresAt && { refreshTokenExpiresAt }),
        },
      },
    },
  });

  return storeConnection.id;
};

export const getStoreConnectionByShop = async (shop: string) => {
  const connection = await prisma.storeConnection.findFirst({
    where: {
      source: "SHOPIFY",
      shopifyConnection: { shopDomain: shop },
    },
    include: { shopifyConnection: true },
  });

  if (!connection) throw new Error(`No store connection found for domain: ${shop}`);
  return connection;
};

export const disconnectStore = async (merchantId: string): Promise<void> => {
  const connection = await prisma.storeConnection.findFirst({
    where: { merchantId },
  });

  if (!connection) throw new Error("No store connection found");

  await prisma.storeConnection.delete({ where: { id: connection.id } });
  // ShopifyConnection is cascade deleted
};

// service: return void → return PaginatedResult<Order>
export const syncShopifyOrders = async (
  merchantId: string
): Promise<PaginatedResult<Order>> => {
  const storeConnections = await prisma.storeConnection.findMany({
    where: { merchantId, source: 'SHOPIFY', isActive: true },
  });

  if (storeConnections.length === 0) {
    throw new Error('No active Shopify store connections found');
  }

  await Promise.all(
    storeConnections.map(async (sc) => {
      const connection = await StoreConnectionFactory.create(sc.id);
      await connection.syncOrders();
    })
  );

  // Return fresh first page immediately after sync
  return getOrders({ merchantId, limit: 20 });
};