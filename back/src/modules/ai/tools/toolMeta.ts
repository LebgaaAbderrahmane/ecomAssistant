import type { ToolName } from '../schemas/intents.schemas';

// The transport-injected identity/state keys a tool schema accepts but a
// CALLER (the LLM/agent) never provides — the transport materializes them:
//   merchantId / customerId / conversationId — conversation scope.
//   excludedProductIds                      — abandoned/rejected product ids
//                                             computed from conversation memory
//                                             by the transport for
//                                             suggestProducts.
// These keys are excluded from the agent-facing contract (contracts
// src/generated/tools.json), whose args are exactly the public, caller-supplied
// keys each tool schema exposes.
export const INJECTED_ARG_NAMES = [
  'merchantId',
  'customerId',
  'conversationId',
  'excludedProductIds',
] as const;

export interface ToolArgMeta {
  description: string;
}

export interface ToolMeta {
  description: string;
  args: Record<string, ToolArgMeta>;
}

// Source of truth for the human-facing wording. The contract test enforces that
// TOOL_META covers EXACTLY the public (non-injected) keys of each tool schema —
// no missing, no stray. The generated tools.json is built from this + schemas.
export const TOOL_META: Record<ToolName, ToolMeta> = {
  searchProducts: {
    description:
      'Search the merchant catalog for a product by name and return the matching products (authoritative NOT_FOUND when absent)',
    args: {
      product: { description: 'Product name or query to search for' },
    },
  },
  selectProduct: {
    description:
      'Select a product the customer picked (by id or by name) and make it the active product',
    args: {
      productId: { description: 'Product id to select' },
      productName: { description: 'Product name to select' },
    },
  },
  getProductDetails: {
    description: 'Return full details (description, price, currency, stock status, category) for a product',
    args: {
      productName: { description: 'Product name to fetch details for' },
      productId: { description: 'Product id to fetch details for' },
    },
  },
  suggestProducts: {
    description: 'Recommend products matching the customer preferences, reranking catalog candidates',
    args: {
      category: { description: 'Product category to match' },
      color: { description: 'Product color to match' },
      size: { description: 'Product size to match' },
      minPrice: { description: 'Minimum price filter' },
      maxPrice: { description: 'Maximum price filter' },
      preferences: { description: 'Free-text preference description' },
    },
  },
  calculateShipping: {
    description: 'Look up the delivery cost configured for a wilaya for this merchant',
    args: {
      wilaya: { description: 'Wilaya (name or number) to calculate shipping for' },
    },
  },
  getOrderStatus: {
    description: 'Return the status and tracking number of an order by its id',
    args: {
      orderId: { description: 'Order id to check the status of' },
    },
  },
  createOrder: {
    description:
      'Create a new pending order (explicit product id, delivery wilaya, commune, quantity), compute the total with delivery cost, and flag it as waiting for confirmation',
    args: {
      productId: { description: 'Product id to order' },
      wilaya: { description: 'Delivery wilaya' },
      commune: { description: 'Delivery commune (baladia)' },
      quantity: { description: 'Quantity to order' },
    },
  },
  confirmOrder: {
    description: 'Confirm an order by its id',
    args: {
      orderId: { description: 'Order id to confirm' },
    },
  },
  modifyOrder: {
    description: "Update an order's quantity, wilaya, or commune by its id and recompute the total",
    args: {
      orderId: { description: 'Order id to update' },
      wilaya: { description: 'New delivery wilaya' },
      commune: { description: 'New delivery commune' },
      quantity: { description: 'New quantity' },
    },
  },
  cancelOrder: {
    description: 'Cancel an order by its id',
    args: {
      orderId: { description: 'Order id to cancel' },
    },
  },
  escalateConversation: {
    description: 'Hand the conversation to a human agent with a reason (idempotent)',
    args: {
      reason: { description: 'Reason the customer needs a human agent' },
    },
  },
};