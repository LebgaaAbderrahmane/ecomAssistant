import axios from "axios";
import crypto from "crypto";
import { config } from "../../config";

export interface ChargilyCheckoutInput {
  amount: number;
  currency: string;
  success_url: string;
  failure_url: string;
  webhook_endpoint: string;
  description?: string;
  locale?: string;
  metadata?: Record<string, unknown>;
}

export interface ChargilyCheckout {
  id: string;
  entity: string;
  livemode: boolean;
  amount: number;
  currency: string;
  status: string;
  checkout_url: string;
  [key: string]: unknown;
}

const client = axios.create({
  baseURL: config.chargily.baseUrl,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${config.chargily.privateKey}`,
  },
});

export const chargilyClient = {
  async createCheckout(input: ChargilyCheckoutInput): Promise<ChargilyCheckout> {
    const { data } = await client.post<ChargilyCheckout>("/checkouts", input);
    return data;
  },

  verifyWebhookSignature(signature: string, rawBody: Buffer | string): boolean {
    const computed = crypto
      .createHmac("sha256", config.chargily.privateKey)
      .update(rawBody)
      .digest("hex");

    try {
      return crypto.timingSafeEqual(
        Buffer.from(computed),
        Buffer.from(signature)
      );
    } catch {
      return false;
    }
  },
};
