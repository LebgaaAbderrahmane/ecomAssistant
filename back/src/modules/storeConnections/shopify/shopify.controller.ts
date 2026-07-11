// src/controllers/shopify.controller.ts
import { Request, Response } from "express";
import * as shopifyService from "./shopify.service";
import { StoreConnectionFactory } from "../../../connections/StoreConnectionFactory";
import { AuthenticatedRequest } from "../../../middlwares/auth.middlware";
import { sendOrderNotification } from "../../whatsapp/whatsapp.controller";
import * as ordersService from "../../orders/orders.service";
import * as productsService from "../../products/products.service";
import prisma from "../../../config/db.config";
const { APP_URL } = process.env;

export async function authenticateShopify(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const { shop } = req.query as Record<string, string>;
  const merchantId = req.merchant!.merchantId;
  try {
    // ShopifyConnection.connect() generates the install URL
    // We instantiate with empty storeConnectionId since it doesn't exist yet
    const connection = new (
      await import("../../../connections/ShopifyConnection")
    ).ShopifyConnection(
      merchantId,
      "", // no storeConnectionId yet — connect() only needs merchantId + shop
      shop,
    );

    const installUrl = await connection.connect(shop);
    console.log("Install URL:", installUrl);
    res.redirect(installUrl);
  } catch (err) {
    console.error("Installation initiation error:", err);
    res.status(500).json({ error: "Failed to initiate installation" });
  }
}

export async function handleOrderWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const hmac = req.headers["x-shopify-hmac-sha256"] as string;
  const shop = req.headers["x-shopify-shop-domain"] as string;
  console.log("the order webhooks was called");

  try {
    const rawBody: Buffer = (req as any).rawBody;

    if (!rawBody) {
      res.status(400).send("Missing raw body");
      return;
    }

    const storeConn = await shopifyService.getStoreConnectionByShop(shop);
    const connection = await StoreConnectionFactory.create(storeConn.id);

    const isValid = connection.verifyWebhookSignature(rawBody, hmac);
    if (!isValid) {
      res.status(401).send("Unauthorized");
      return;
    }

    const order = JSON.parse(rawBody.toString());
    const savedOrders = await connection.upsertOrders([order]);
    console.log("New order saved:", order.id);

    for (const saved of savedOrders) {
      sendOrderNotification(saved).catch((err) => {
        console.error("[Shopify] Order notification failed:", err);
      });
      ordersService.emitOrderCreated({ merchantId: saved.merchantId, orderId: saved.id });
    }

    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Error");
  }
}

export async function handleProductWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const hmac = req.headers["x-shopify-hmac-sha256"] as string;
  const shop = req.headers["x-shopify-shop-domain"] as string;

  try {
    const rawBody: Buffer = (req as any).rawBody;

    if (!rawBody) {
      res.status(400).send("Missing raw body");
      return;
    }

    const storeConn = await shopifyService.getStoreConnectionByShop(shop);
    const connection = await StoreConnectionFactory.create(storeConn.id);

    const isValid = connection.verifyWebhookSignature(rawBody, hmac);
    if (!isValid) {
      res.status(401).send("Unauthorized");
      return;
    }

    const product = JSON.parse(rawBody.toString());
    await productsService.upsertSingleProduct(storeConn.merchantId, product);
    console.log("[Shopify] Product webhook processed:", product.id);

    productsService.emitProductsSynced({
      merchantId: storeConn.merchantId,
      count: 1,
    });

    res.status(200).send("OK");
  } catch (err) {
    console.error("Product webhook processing error:", err);
    res.status(500).send("Error");
  }
}

export async function getShopInfo(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const merchantId = req.merchant!.merchantId;
  try {
    const connection = await StoreConnectionFactory.createForMerchant(merchantId);
    const shopInfo = await connection.getShopInfo();
    res.json(shopInfo);
  } catch (err) {
    console.error("Error fetching shop info:", err);
    res.status(500).json({ error: "Failed to fetch shop info" });
  }
}

export async function listWebhooks(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const merchantId = req.merchant!.merchantId;
  try {
    const connection = await StoreConnectionFactory.createForMerchant(merchantId);
    const webhooks = await connection.listWebhooks();
    res.json(webhooks);
  } catch (err) {
    console.error("Error listing webhooks:", err);
    res.status(500).json({ error: "Failed to list webhooks" });
  }
}

export async function reRegisterWebhooks(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const merchantId = req.merchant!.merchantId;
  try {
    const connection = await StoreConnectionFactory.createForMerchant(merchantId);
    await connection.registerWebhooks();
    res.json({ success: true, message: "Webhooks re-registered" });
  } catch (err) {
    console.error("Error re-registering webhooks:", err);
    res.status(500).json({ error: "Failed to re-register webhooks" });
  }
}

export async function getStoreSettings(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const merchantId = req.merchant!.merchantId;
  try {
    const storeConn = await prisma.storeConnection.findFirst({
      where: { merchantId, source: "SHOPIFY" },
      include: { shopifyConnection: { select: { currency: true, defaultOrderStatus: true } } },
    });
    if (!storeConn?.shopifyConnection) {
      res.status(404).json({ error: "No Shopify connection" });
      return;
    }
    res.json(storeConn.shopifyConnection);
  } catch (err) {
    console.error("Error fetching store settings:", err);
    res.status(500).json({ error: "Failed to fetch store settings" });
  }
}

export async function updateStoreSettings(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const merchantId = req.merchant!.merchantId;
  const { currency, defaultOrderStatus } = req.body;
  try {
    const storeConn = await prisma.storeConnection.findFirst({
      where: { merchantId, source: "SHOPIFY" },
    });
    if (!storeConn) {
      res.status(404).json({ error: "No Shopify connection" });
      return;
    }
    const connection = await StoreConnectionFactory.create(storeConn.id);
    await connection.updateSettings({ currency, defaultOrderStatus });
    res.json({ success: true });
  } catch (err) {
    console.error("Error updating store settings:", err);
    res.status(500).json({ error: "Failed to update store settings" });
  }
}

export async function disconnect(
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> {
  const merchantId = req.merchant!.merchantId;

  try {
    await shopifyService.disconnectStore(merchantId);
    res.status(200).json({ success: true });
  } catch (err) {
    console.error("Disconnect error:", err);
    res.status(500).json({ error: "Failed to disconnect store." });
  }
}

export async function callBack(req: Request, res: Response): Promise<void> {
  const { code, shop, state } = req.query as Record<string, string>;

  if (!shopifyService.verifyHmac(req.query as Record<string, string>)) {
    res.status(403).json({
      success: false,
      message: "HMAC validation failed.",
    });
    return;
  }

  try {
    const { merchantId } = await shopifyService.consumeNonce(state, shop);

    const {
      access_token,
      scope,
      expires_in,
      refresh_token,
      refresh_token_expires_in,
    } = await shopifyService.exchangeCodeForToken(shop, code);

    const storeConnectionId = await shopifyService.saveStoreConnection(
      merchantId,
      shop,
      access_token,
      scope,
      expires_in,
      refresh_token,
      refresh_token_expires_in,
    );

    const connection = await StoreConnectionFactory.create(storeConnectionId);

    // Register webhooks before considering the connection ready
    await connection
      .registerWebhooks()
      .catch((err) =>
        console.error("[Shopify] Webhook registration failed:", err),
      );

    // Run syncs in the background
    connection
      .syncProducts()
      .catch((err) =>
        console.error("[Shopify] Background product sync failed:", err),
      );

    connection
      .syncOrders()
      .then((result) => {
        console.log("[Shopify] Background order sync completed");
      })
      .catch((err) =>
        console.error("[Shopify] Background order sync failed:", err),
      );

    res.status(200).json({
      success: true,
      message: "Shopify store connected successfully.",
      storeConnectionId,
      shop,
    });
  } catch (err) {
    console.error("Shopify OAuth error:", err);

    res.status(500).json({
      success: false,
      message: "Failed to connect Shopify store.",
      error: err instanceof Error ? err.message : "Unknown error",
    });
  }
}

export async function syncStore(req: AuthenticatedRequest, res: Response): Promise<void> {
  const merchantId = req.merchant!.merchantId;

  try {
    const connection =
      await StoreConnectionFactory.createForMerchant(merchantId);

    const [productsResult, ordersResult] = await Promise.allSettled([
      connection.syncProducts(),
      connection.syncOrders(),
    ]);

    const response = {
      products:
        productsResult.status === "fulfilled"
          ? { success: true }
          : { success: false, error: (productsResult.reason as Error).message },
      orders:
        ordersResult.status === "fulfilled"
          ? { success: true }
          : { success: false, error: (ordersResult.reason as Error).message },
    };

    const statusCode =
      productsResult.status === "rejected" && ordersResult.status === "rejected"
        ? 500
        : 200;

    res.status(statusCode).json(response);
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Failed to sync store." });
  }
}

export const syncOrders = async (
  req: AuthenticatedRequest,
  res: Response,
): Promise<void> => {
  const merchantId = req.merchant!.merchantId;

  try {
    const result = await shopifyService.syncShopifyOrders(merchantId);
    res.status(200).json(result);
  } catch (err) {
    console.error("Manual order sync error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
};
