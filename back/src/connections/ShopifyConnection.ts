import crypto from "crypto";
import axios from "axios";
import prisma from "../config/db.config";
import { redis } from "../config";
import { decryptToken, encryptToken } from "../lib/crypto";
import {
  AbstractStoreConnection,
  OrderDetails,
  ProductDetails,
  TokenResult,
} from "./AbstractStoreConnection";

const { SHOPIFY_API_KEY, SHOPIFY_API_SECRET, SHOPIFY_SCOPES, APP_URL } =
  process.env;

const NONCE_TTL = 600;
const API_VERSION = "2025-07";

export class ShopifyConnection extends AbstractStoreConnection {
  private shopDomain: string;

  constructor(
    merchantId: string,
    storeConnectionId: string,
    shopDomain: string,
  ) {
    super(merchantId, storeConnectionId);
    this.shopDomain = shopDomain;
  }

  // ─────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────

  async connect(shop: string): Promise<string> {
    const nonce = crypto.randomBytes(16).toString("hex");
    await redis.set(
      `shopify-nonce:${nonce}`,
      JSON.stringify({ merchantId: this.merchantId, shop }),
      { EX: NONCE_TTL },
    );

    const redirectUri = `${APP_URL}/store-connection/shopify/callback`;

    return (
      `https://${shop}/admin/oauth/authorize` +
      `?client_id=${SHOPIFY_API_KEY}` +
      `&scope=${SHOPIFY_SCOPES}` +
      `&redirect_uri=${redirectUri}` +
      `&state=${nonce}`
    );
  }

  async disconnect(): Promise<void> {
    const shopifyConn = await prisma.shopifyConnection.findUnique({
      where: { storeConnectionId: this.storeConnectionId },
    });

    if (!shopifyConn) throw new Error("Shopify connection not found");

    await prisma.storeConnection.delete({
      where: { id: this.storeConnectionId },
    });
    // ShopifyConnection is cascade deleted via relation
  }

  async refreshAccessToken(): Promise<TokenResult> {
    const shopifyConn = await prisma.shopifyConnection.findUnique({
      where: { storeConnectionId: this.storeConnectionId },
    });

    if (!shopifyConn?.refreshToken) {
      throw new Error("No refresh token available");
    }

    const decryptedRefreshToken = decryptToken(shopifyConn.refreshToken);

    const response = await axios.post(
      `https://${this.shopDomain}/admin/oauth/access_token`,
      {
        client_id: SHOPIFY_API_KEY,
        client_secret: SHOPIFY_API_SECRET,
        grant_type: "refresh_token",
        refresh_token: decryptedRefreshToken,
      },
    );

    const { access_token, refresh_token, expires_in } = response.data;

    const tokenExpiresAt = new Date(Date.now() + expires_in * 1000);

    await prisma.shopifyConnection.update({
      where: { storeConnectionId: this.storeConnectionId },
      data: {
        accessToken: encryptToken(access_token),
        refreshToken: refresh_token ? encryptToken(refresh_token) : undefined,
        tokenExpiresAt,
      },
    });

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiresAt,
    };
  }

  // ─────────────────────────────────────────────
  // Token helper
  // ─────────────────────────────────────────────

  private async getValidAccessToken(): Promise<string> {
    const shopifyConn = await prisma.shopifyConnection.findUnique({
      where: { storeConnectionId: this.storeConnectionId },
    });

    if (!shopifyConn) throw new Error("Shopify connection not found");

    const isExpired =
      shopifyConn.tokenExpiresAt && shopifyConn.tokenExpiresAt <= new Date();

    if (isExpired) {
      const refreshed = await this.refreshAccessToken();
      return refreshed.accessToken;
    }

    return decryptToken(shopifyConn.accessToken);
  }

  // ─────────────────────────────────────────────
  // Data Sync
  // ─────────────────────────────────────────────

  async syncProducts(): Promise<void> {
    const accessToken = await this.getValidAccessToken();
    const headers = { "X-Shopify-Access-Token": accessToken };

    let url: string | null =
      `https://${this.shopDomain}/admin/api/${API_VERSION}/products.json?limit=250`;

    while (url) {
      const { data, headers: resHeaders } = await axios.get(url, { headers });
      console.log("the products are: ", JSON.stringify(data.products, null, 2));
      await this.upsertProducts(data.products);
      url = this.extractNextPageUrl(resHeaders["link"]);
    }
  }

  async syncOrders(): Promise<void> {
    const accessToken = await this.getValidAccessToken();
    const headers = { "X-Shopify-Access-Token": accessToken };

    let url: string | null =
      `https://${this.shopDomain}/admin/api/${API_VERSION}/orders.json?limit=250&status=any`;

    let totalCount = 0;
    while (url) {
      const { data, headers: resHeaders } = await axios.get(url, { headers });
      const orders = data.orders || [];
      totalCount += orders.length;
      console.log(`[Shopify] Fetched ${orders.length} orders from Shopify`);
      await this.upsertOrders(orders);
      url = this.extractNextPageUrl(resHeaders["link"]);
    }
    console.log(`[Shopify] syncOrders completed — total fetched: ${totalCount}`);
  }

  // ─────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────

  async registerWebhooks(): Promise<void> {
    const accessToken = await this.getValidAccessToken();
    const headers = { "X-Shopify-Access-Token": accessToken };
    const base = `https://${this.shopDomain}/admin/api/${API_VERSION}`;
    const address = `${APP_URL}/store-connection/shopify/webhooks/orders`;

    // Check if already registered
    const { data } = await axios.get(
      `${base}/webhooks.json?topic=orders/create`,
      {
        headers,
      },
    );

    const alreadyRegistered = data.webhooks.some(
      (w: { address: string }) => w.address === address,
    );

    if (alreadyRegistered) {
      console.log("Webhook already registered, skipping.");
      return;
    }

    await axios.post(
      `${base}/webhooks.json`,
      {
        webhook: {
          topic: "orders/create",
          address,
          format: "json",
        },
      },
      { headers },
    );
  }

  verifyWebhookSignature(payload: Buffer, signature: string): boolean {
    const generated = crypto
      .createHmac("sha256", SHOPIFY_API_SECRET!)
      .update(payload)
      .digest("base64");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(generated),
        Buffer.from(signature),
      );
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────
  // Order Operations
  // ─────────────────────────────────────────────

  async getOrder(platformOrderId: string): Promise<OrderDetails> {
    const accessToken = await this.getValidAccessToken();

    const { data } = await axios.get(
      `https://${this.shopDomain}/admin/api/${API_VERSION}/orders/${platformOrderId}.json`,
      { headers: { "X-Shopify-Access-Token": accessToken } },
    );

    const o = data.order;

    return {
      platformOrderId: String(o.id),
      customerName: o.customer
        ? `${o.customer.first_name} ${o.customer.last_name}`.trim()
        : "Unknown",
      customerPhone: o.customer?.phone ?? "",
      address: o.shipping_address?.address1 ?? "",
      wilaya: o.shipping_address?.province ?? "",
      commune: o.shipping_address?.city ?? undefined,
      totalAmount: parseFloat(o.total_price),
      lineItems: o.line_items.map(
        (item: { title: string; quantity: number; price: string }) => ({
          title: item.title,
          quantity: item.quantity,
          price: item.price,
        }),
      ),
    };
  }

  async updateOrderStatus(
    platformOrderId: string,
    status: string,
  ): Promise<void> {
    const accessToken = await this.getValidAccessToken();

    await axios.post(
      `https://${this.shopDomain}/admin/api/${API_VERSION}/orders/${platformOrderId}/fulfillments.json`,
      { fulfillment: { status } },
      { headers: { "X-Shopify-Access-Token": accessToken } },
    );
  }

  // ─────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────

  private async upsertProducts(products: any[]): Promise<void> {
    for (const p of products) {
      const price = parseFloat(p.variants?.[0]?.price ?? "0");
      const images = p.images.map((img: { src: string }) => img.src);
      const stockStatus =
        (p.variants?.[0]?.inventory_quantity ?? 0) > 0
          ? "in_stock"
          : "out_of_stock";

      await prisma.product.upsert({
        where: {
          merchantId_platformProductId: {
            merchantId: this.merchantId,
            platformProductId: String(p.id),
          },
        },
        update: {
          name: p.title,
          description: p.body_html ?? "",
          price,
          images,
          variants: p.variants,
          stockStatus,
          category: p.product_type || null,
        },
        create: {
          merchantId: this.merchantId,
          platformProductId: String(p.id),
          name: p.title,
          description: p.body_html ?? "",
          price,
          currency: "DZD",
          images,
          variants: p.variants,
          stockStatus,
          category: p.product_type || null,
        },
      });
    }
  }

  async upsertOrders(orders: any[]): Promise<{ id: string; merchantId: string; customerId: string; customerName: string; customerPhone: string; productName: string; platformOrderId: string; totalAmount: number; wilaya: string }[]> {
    const saved: { id: string; merchantId: string; customerId: string; customerName: string; customerPhone: string; productName: string; platformOrderId: string; totalAmount: number; wilaya: string }[] = [];

    for (const o of orders) {
      const existing = await prisma.order.findFirst({
        where: { merchantId: this.merchantId, platformOrderId: String(o.id) },
      });

      if (existing) {
        await prisma.order.update({
          where: { id: existing.id },
          data: { status: this.mapFinancialStatus(o.financial_status) },
        });
        continue;
      }

      const firstItem = o.line_items[0];
      if (!firstItem) {
        console.log(`[Shopify] Skipping order ${o.id} — no line items`);
        continue;
      }

      let product = firstItem.product_id
        ? await prisma.product.findFirst({
            where: { merchantId: this.merchantId, platformProductId: String(firstItem.product_id) },
          })
        : null;

      if (!product) {
        product = await prisma.product.findFirst({
          where: { merchantId: this.merchantId, name: firstItem.title },
        });
      }

      if (!product) {
        console.log(`[Shopify] Skipping order ${o.id} — no matching product for "${firstItem.title}" (product_id: ${firstItem.product_id})`);
        continue;
      }

      const phone = o.customer?.phone ?? "";
      const customerName = o.customer
        ? `${o.customer.first_name} ${o.customer.last_name}`.trim()
        : "Unknown";

      const customer = phone
        ? await prisma.customer.upsert({
            where: { merchantId_phone: { merchantId: this.merchantId, phone } },
            update: { name: customerName },
            create: { merchantId: this.merchantId, phone, name: customerName },
          })
        : await prisma.customer.create({
            data: { merchantId: this.merchantId, phone: "", name: customerName },
          });

      let created;
      try {
        created = await prisma.order.create({
          data: {
            merchantId: this.merchantId,
            customerId: customer.id,
            platformOrderId: String(o.id),
            wilaya: o.shipping_address?.province ?? "",
            commune: o.shipping_address?.city ?? null,
            address: o.shipping_address?.address1 ?? "",
            productId: product.id,
            productName: firstItem.title,
            quantity: firstItem.quantity,
            totalAmount: parseFloat(o.total_price),
            status: this.mapFinancialStatus(o.financial_status),
          },
        });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          console.warn(`[Shopify] Order #${o.id} already exists for merchant ${this.merchantId} — skipping duplicate`);
          continue;
        }
        throw err;
      }

      saved.push({
        id: created.id,
        merchantId: created.merchantId,
        customerId: customer.id,
        customerName,
        customerPhone: phone,
        productName: created.productName,
        platformOrderId: created.platformOrderId,
        totalAmount: created.totalAmount,
        wilaya: created.wilaya,
      });
    }

    return saved;
  }

  private mapFinancialStatus(status: string): string {
    const map: Record<string, string> = {
      pending: "PENDING",
      authorized: "PENDING",
      paid: "CONFIRMED",
      partially_paid: "PENDING",
      refunded: "CANCELLED",
      voided: "CANCELLED",
    };
    return map[status] ?? "PENDING";
  }

  private extractNextPageUrl(linkHeader: string | undefined): string | null {
    if (!linkHeader) return null;
    const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    return match ? match[1] : null;
  }
}
