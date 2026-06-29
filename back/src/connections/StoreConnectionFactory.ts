// src/connections/StoreConnectionFactory.ts

import prisma from "../config/db.config";
import { Source } from "@prisma/client";
import { AbstractStoreConnection } from "./AbstractStoreConnection";
import { ShopifyConnection } from "./ShopifyConnection";

export class StoreConnectionFactory {
  static async create(storeConnectionId: string): Promise<AbstractStoreConnection> {
    const storeConnection = await prisma.storeConnection.findUnique({
      where: { id: storeConnectionId },
      include: { shopifyConnection: true },
    });

    if (!storeConnection) {
      throw new Error(`StoreConnection not found: ${storeConnectionId}`);
    }

    switch (storeConnection.source) {
      case Source.SHOPIFY: {
        if (!storeConnection.shopifyConnection) {
          throw new Error("ShopifyConnection record missing for this StoreConnection");
        }

        return new ShopifyConnection(
          storeConnection.merchantId,
          storeConnection.id,
          storeConnection.shopifyConnection.shopDomain
        );
      }

      // case Source.WOOCOMMERCE: {
      //   return new WooCommerceConnection(
      //     storeConnection.merchantId,
      //     storeConnection.id,
      //     storeConnection.wooCommerceConnection!.siteUrl
      //   );
      // }

      default:
        throw new Error(`Unsupported store source: ${storeConnection.source}`);
    }
  }

  // Convenience: resolve by merchantId when there's only one active connection
  static async createForMerchant(
    merchantId: string,
    source?: Source
  ): Promise<AbstractStoreConnection> {
    const storeConnection = await prisma.storeConnection.findFirst({
      where: {
        merchantId,
        isActive: true,
        ...(source ? { source } : {}),
      },
      include: { shopifyConnection: true },
    });

    if (!storeConnection) {
      throw new Error(`No active store connection found for merchant: ${merchantId}`);
    }

    return StoreConnectionFactory.create(storeConnection.id);
  }
}