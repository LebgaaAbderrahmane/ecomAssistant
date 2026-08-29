export interface OrderNotificationData {
  id: string;
  merchantId: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  productName: string;
  platformOrderId: string;
  totalAmount: number;
  wilaya: string;
  productId: string;
  quantity: number;
  commune: string;
  address: string;
  orderSource?: 'CONVERSATION' | 'PLATFORM';
}

export interface OrderDetails {
  platformOrderId: string;
  customerName: string;
  customerPhone: string;
  address: string;
  wilaya: string;
  commune?: string;
  totalAmount: number;
  lineItems: { title: string; quantity: number; price: string }[];
}

export interface ProductDetails {
  platformProductId: string;
  name: string;
  description: string;
  price: number;
  images: string[];
  variants: {
    id: number;
    price: string;
    title: string;
    inventory_quantity: number;
  }[];
  stockStatus: "in_stock" | "out_of_stock";
  category?: string;
}

export interface TokenResult {
  accessToken: string;
  refreshToken?: string;
  tokenExpiresAt?: Date;
  refreshTokenExpiresAt?: Date;
  scopes?: string;
}

export abstract class AbstractStoreConnection {
  protected merchantId: string;
  protected storeConnectionId: string;

  constructor(merchantId: string, storeConnectionId: string) {
    this.merchantId = merchantId;
    this.storeConnectionId = storeConnectionId;
  }

  // ─────────────────────────────────────────────
  // Authentication
  // ─────────────────────────────────────────────

  /** Generate the OAuth install/authorization URL to redirect the merchant to */
  abstract connect(shop: string): Promise<string>;

  /** Revoke access and delete credentials from DB */
  abstract disconnect(): Promise<void>;

  /** Refresh the access token using the stored refresh token */
  abstract refreshAccessToken(): Promise<TokenResult>;

  // ─────────────────────────────────────────────
  // Data Sync
  // ─────────────────────────────────────────────

  /** Pull all products from the platform and upsert into DB */
  abstract syncProducts(): Promise<void>;

  /** Pull all orders from the platform and upsert into DB */
  abstract syncOrders(): Promise<void>;

  // ─────────────────────────────────────────────
  // Webhooks
  // ─────────────────────────────────────────────

  /** Register required webhooks on the platform (e.g. orders/create) */
  abstract registerWebhooks(): Promise<void>;

  /** Verify the HMAC signature of an incoming webhook payload */
  abstract verifyWebhookSignature(payload: Buffer, signature: string): boolean;

  // ─────────────────────────────────────────────
  // Order Operations
  // ─────────────────────────────────────────────

  /** Fetch a single order by its platform order ID */
  abstract getOrder(platformOrderId: string): Promise<OrderDetails>;

  /** Update the status of an order on the platform */
  abstract updateOrderStatus(
    platformOrderId: string,
    status: string,
  ): Promise<void>;

  abstract upsertOrders(orders: any[]): Promise<OrderNotificationData[]>;

  // ─────────────────────────────────────────────
  // Shop info & settings
  // ─────────────────────────────────────────────

  /** Fetch platform shop info */
  abstract getShopInfo(): Promise<Record<string, unknown>>;

  /** List registered webhooks on the platform */
  abstract listWebhooks(): Promise<unknown[]>;

  /** Update connection-level settings (currency, default order status, …) */
  abstract updateSettings(settings: {
    currency?: string;
    defaultOrderStatus?: string;
  }): Promise<void>;
}
