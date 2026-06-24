import express, { Router, Request, Response } from "express";
import * as shopifyService from "../services/shopify.service";


export async function authenticateShopify(req: Request, res: Response): Promise<void> {
    const { shop, merchantId } = req.query as Record<string, string>;
    try {
        const installUrl = await shopifyService.generateInstallUrl(shop, merchantId);
        res.redirect(installUrl); 
    } catch (err) {
        console.error("Installation initiation error:", err);
        res.status(500).json({ error: "Failed to initiate installation" });
    }
}

export async function callBack(req: Request, res: Response): Promise<void> {
    const { code, hmac, shop, state } = req.query as Record<string, string>;
    const frontUrl = process.env.FRONTEND_URL!;

    console.log("Callback query params:", req.query);
    console.log("HMAC received:", hmac);

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

        await shopifyService.saveStoreConnection(
            merchantId,
            shop,
            access_token,
            scope,
            expires_in,
            refresh_token,
            refresh_token_expires_in
        );

        // Fire-and-forget — neither blocks the response nor fails auth if they error
        shopifyService.syncShopData(merchantId, shop, access_token).catch(console.error);
        shopifyService.registerWebhook(shop, access_token).catch((err) =>
            console.error("Webhook registration failed (non-fatal):", err)
        );

        res.status(200).json({ message: "auth and syncing succeeded" });
    } catch (err) {
        console.error("Shopify OAuth error:", err);
        res.status(400).json({ message: "auth and syncing failed", err });
    }
}

export async function handleOrderWebhook(req: Request, res: Response): Promise<void> {
    const hmac = req.headers["x-shopify-hmac-sha256"] as string;
    const shop = req.headers["x-shopify-shop-domain"] as string;

    const isValid = shopifyService.verifyWebhookHmac(req.body as Buffer, hmac);
    if (!isValid) {
        res.status(401).send("Unauthorized");
        return;
    }

    try {
        const connection = await shopifyService.getStoreConnectionByShop(shop);
        const order = JSON.parse((req.body as Buffer).toString());
        
        await shopifyService.upsertOrders(connection.merchantId, [order]);

        // TODO: trigger WhatsApp agent for COD confirmation
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