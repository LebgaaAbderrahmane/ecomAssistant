// src/controllers/shopify.controller.ts
import { Request, Response } from "express";
import * as shopifyService from "./shopify.service";
import { StoreConnectionFactory } from "../../../connections/StoreConnectionFactory";
import { AuthenticatedRequest } from "../../../middlwares/auth.middlware"
const { APP_URL } = process.env;

export async function authenticateShopify(req: Request, res: Response): Promise<void> {
  const { shop, merchantId } = req.query as Record<string, string>;

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

export async function callBack(req: Request, res: Response): Promise<void> {
  const { code, hmac, shop, state } = req.query as Record<string, string>;

  if (!shopifyService.verifyHmac(req.query as Record<string, string>)) {
    console.error("HMAC validation failed for query:", req.query);
    res.status(403).json({ error: "HMAC validation failed." });
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

    // Save to DB and get the storeConnectionId back
    const storeConnectionId = await shopifyService.saveStoreConnection(
      merchantId,
      shop,
      access_token,
      scope,
      expires_in,
      refresh_token,
      refresh_token_expires_in
    );

    // Now we have storeConnectionId — instantiate via factory for fire-and-forget ops
    const connection = await StoreConnectionFactory.create(storeConnectionId);

    connection.syncProducts().catch(console.error);
    connection.syncOrders().catch(console.error);
    connection.registerWebhooks().catch((err) =>
      console.error("Webhook registration failed (non-fatal):", err)
    );

    res.status(200).json({ message: "Auth and syncing succeeded" });
  } catch (err) {
    console.error("Shopify OAuth error:", err);
    res.status(400).json({ message: "Auth and syncing failed", err });
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


export async function syncStore(req: Request, res: Response): Promise<void> {
  const { merchantId } = req.body;

  try {
    const connection = await StoreConnectionFactory.createForMerchant(merchantId);
    await connection.syncProducts();
    await connection.syncOrders();
    res.status(200).json({ message: "Sync completed" });
  } catch (err) {
    console.error("Sync error:", err);
    res.status(500).json({ error: "Failed to sync store." });
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

export const syncOrders = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId;
  const result = await shopifyService.syncShopifyOrders(merchantId);
  return res.status(200).json(result);
};