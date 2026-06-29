// src/controllers/shopify.controller.ts
import { Request, Response } from "express";
import * as shopifyService from "./shopify.service";
import { StoreConnectionFactory } from "../../../connections/StoreConnectionFactory";
import { AuthenticatedRequest } from "../../../middlwares/auth.middlware"
import { getMerchantIdFromToken } from "../../../lib/jwt";
const { APP_URL } = process.env;

export async function authenticateShopify(req: Request, res: Response): Promise<void> {
  const { shop } = req.query as Record<string, string>;
  const merchantId = getMerchantIdFromToken(req.headers.authorization!)
  try {
    // ShopifyConnection.connect() generates the install URL
    // We instantiate with empty storeConnectionId since it doesn't exist yet
    const connection = new (await import("../../../connections/ShopifyConnection")).ShopifyConnection(
      merchantId,
      "", // no storeConnectionId yet — connect() only needs merchantId + shop
      shop
    );

    const installUrl = await connection.connect(shop);
    res.redirect(installUrl);
  } catch (err) {
    console.error("Installation initiation error:", err);
    res.status(500).json({ error: "Failed to initiate installation" });
  }
}

export async function handleOrderWebhook(req: Request, res: Response): Promise<void> {
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

    const order = JSON.parse(rawBody.toString()); // ✅ parse from raw buffer
    const orderDetails = await connection.getOrder(String(order.id));

    console.log("New order received:", orderDetails);
    res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook processing error:", err);
    res.status(500).send("Error");
  }
}


export async function disconnect(req: Request, res: Response): Promise<void> {
  const { merchantId } = req.body;

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
      refresh_token_expires_in
    );

    const connection = await StoreConnectionFactory.create(storeConnectionId);

    // Register webhooks before considering the connection ready
    await connection.registerWebhooks().catch((err) =>
      console.error("[Shopify] Webhook registration failed:", err)
    );

    // Run syncs in the background
    connection.syncProducts().catch((err) =>
      console.error("[Shopify] Background product sync failed:", err)
    );

    connection.syncOrders().catch((err) =>
      console.error("[Shopify] Background order sync failed:", err)
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

export async function syncStore(req: Request, res: Response): Promise<void> {
  const { merchantId } = req.body;

  try {
    const connection = await StoreConnectionFactory.createForMerchant(merchantId);

    // ✅ Run in parallel, collect individual results
    const [productsResult, ordersResult] = await Promise.allSettled([
      connection.syncProducts(),
      connection.syncOrders(),
    ]);

    const response = {
      products: productsResult.status === "fulfilled"
        ? { success: true }
        : { success: false, error: (productsResult.reason as Error).message },
      orders: ordersResult.status === "fulfilled"
        ? { success: true }
        : { success: false, error: (ordersResult.reason as Error).message },
    };

    // 200 even if one failed — partial success is still success
    const statusCode = productsResult.status === "rejected" && ordersResult.status === "rejected"
      ? 500
      : 200;

    res.status(statusCode).json(response);
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Failed to sync store." });
  }
}

export const syncOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const merchantId = req.merchant!.merchantId;

  try {
    const result = await shopifyService.syncShopifyOrders(merchantId);
    res.status(200).json(result);
  } catch (err) {
    console.error("Manual order sync error:", err);
    res.status(500).json({ error: (err as Error).message });
  }
};