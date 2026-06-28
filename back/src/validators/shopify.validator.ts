import { z } from "zod"

export const shopifyAuthSchema = z.object({
    merchantId: z.string(),
    shop: z.string()
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/, {
    message: "Invalid Shopify shop domain",
  })
})
