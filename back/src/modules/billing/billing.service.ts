import axios from "axios";
import { config } from "../../config";
import { PLANS, type PlanKey } from "../../config/plans";
import { chargilyClient } from "./chargily.client";

const CHECKOUT_LOCALE = "ar";

export const billingService = {
  createCheckout: async (merchantId: string, plan: PlanKey) => {
    const planConfig = PLANS[plan];

    try {
      const checkout = await chargilyClient.createCheckout({
        amount: planConfig.amount,
        currency: planConfig.currency,
        success_url: `${config.appUrl}/billing/payment/success`,
        failure_url: `${config.appUrl}/billing/payment/failure`,
        webhook_endpoint: `${config.appUrl}/billing/webhook`,
        locale: CHECKOUT_LOCALE,
        description: `EcomAssistant ${planConfig.name} plan`,
        metadata: { merchantId, plan },
      });

      return {
        checkoutId: checkout.id,
        checkoutUrl: checkout.checkout_url,
        amount: checkout.amount,
        currency: checkout.currency,
      };
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        if (status && status >= 400 && status < 500) {
          const message =
            err.response?.data?.message ||
            "Chargily rejected the checkout request";
          const error: Error & { status?: number } = new Error(
            typeof message === "string" ? message : "Chargily rejected the checkout request"
          );
          error.status = status;
          throw error;
        }
      }

      const error: Error & { status?: number } = new Error(
        "Payment provider unavailable"
      );
      error.status = 502;
      throw error;
    }
  },
};
