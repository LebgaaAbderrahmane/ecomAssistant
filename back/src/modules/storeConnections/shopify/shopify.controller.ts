// src/controllers/shopify.controller.ts
import { Request, Response } from "express";
import * as shopifyService from "./shopify.service";
import { StoreConnectionFactory } from "../../../connections/StoreConnectionFactory";
import { AuthenticatedRequest } from "../../../middlwares/auth.middlware";
import { sendOrderNotification } from "../../whatsapp/whatsapp.controller";
import * as ordersService from "../../orders/orders.service";
import * as productsService from "../../products/products.service";
import prisma from "../../../config/db.config";
import { moduleLogger } from "../../../lib/logger";

const log = moduleLogger('shopify');
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
    log.info({ installUrl }, 'install URL');
    res.redirect(installUrl);
  } catch (err) {
    log.error({ err }, 'installation initiation error');
    res.status(500).json({ error: "Failed to initiate installation" });
  }
}

export async function handleOrderWebhook(
  req: Request,
  res: Response,
): Promise<void> {
  const hmac = req.headers["x-shopify-hmac-sha256"] as string;
  const shop = req.headers["x-shopify-shop-domain"] as string;
  log.info('order webhook called');

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
    log.info({ orderId: order.id }, 'new order saved');

    for (const saved of savedOrders) {
      sendOrderNotification(saved).catch((err) => {
        log.error({ err }, 'order notification failed');
      });
      ordersService.emitOrderCreated({ merchantId: saved.merchantId, orderId: saved.id });
    }

    res.status(200).send("OK");
  } catch (err) {
    log.error({ err }, 'webhook processing error');
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
    log.info({ productId: product.id }, 'product webhook processed');

    productsService.emitProductsSynced({
      merchantId: storeConn.merchantId,
      count: 1,
    });

    res.status(200).send("OK");
  } catch (err) {
    log.error({ err }, 'product webhook processing error');
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
    log.error({ err }, 'error fetching shop info');
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
    log.error({ err }, 'error listing webhooks');
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
    log.error({ err }, 'error re-registering webhooks');
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
    log.error({ err }, 'error fetching store settings');
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
    log.error({ err }, 'error updating store settings');
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
    log.error({ err }, 'disconnect error');
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
        log.error({ err }, 'webhook registration failed'),
      );

    // Run syncs in the background
    connection
      .syncProducts()
      .catch((err) =>
        log.error({ err }, 'background product sync failed'),
      );

    connection
      .syncOrders()
      .then((result) => {
        log.info('background order sync completed');
      })
      .catch((err) =>
        log.error({ err }, 'background order sync failed'),
      );

    res.status(200).json({
      success: true,
      message: "Shopify store connected successfully.",
      storeConnectionId,
      shop,
    });
  } catch (err) {
    log.error({ err }, 'OAuth error');

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
    log.error({ err }, 'sync error');
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
    log.error({ err }, 'manual order sync error');
    res.status(500).json({ error: (err as Error).message });
  }
};
