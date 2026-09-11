export const TOOL_NAMES = [
  'searchProducts',
  'recallPreviousProducts',
  'chooseProduct',
  'getProductDetails',
  'suggestProducts',
  'calculateShipping',
  'getOrderStatus',
  'createOrder',
  'confirmOrder',
  'modifyOrder',
  'cancelOrder',
  'escalateConversation',
] as const;

export type ToolName = (typeof TOOL_NAMES)[number];

export type ToolOutcome = 'SUCCESS' | 'NOT_FOUND' | 'AMBIGUOUS';

export type ToolArgType = 'string' | 'integer' | 'number' | 'boolean' | 'string[]';

export interface ToolArg {
  name: string;
  type: ToolArgType;
  required: boolean;
  description: string;
}

export interface ToolDescriptor {
  name: ToolName;
  description: string;
  args: readonly ToolArg[];
}

export const TOOL_DESCRIPTIONS: readonly ToolDescriptor[] = [
  {
    name: 'searchProducts',
    description: 'Search the merchant catalog for a product and return the matching products',
    args: [{ name: 'product', type: 'string', required: true, description: 'Product name or query to search for' }],
  },
  {
    name: 'recallPreviousProducts',
    description: "Recall products discussed earlier in the conversation when the customer refers to a product without naming it",
    args: [{ name: 'limit', type: 'integer', required: false, description: 'Maximum number of products to recall' }],
  },
  {
    name: 'chooseProduct',
    description: "Select a product the customer picked, by name or by its index in the last search results, and make it the active product",
    args: [
      { name: 'productName', type: 'string', required: false, description: 'Product name to select' },
      { name: 'productIndex', type: 'integer', required: false, description: 'Index of the product in the last search results' },
    ],
  },
  {
    name: 'getProductDetails',
    description: 'Return full details (description, price, currency, stock status, category) for a product',
    args: [{ name: 'productName', type: 'string', required: false, description: 'Product name to fetch details for' }],
  },
  {
    name: 'suggestProducts',
    description: 'Recommend products matching the customer preferences, reranking catalog candidates',
    args: [
      { name: 'category', type: 'string', required: false, description: 'Product category to match' },
      { name: 'color', type: 'string', required: false, description: 'Product color to match' },
      { name: 'size', type: 'string', required: false, description: 'Product size to match' },
      { name: 'minPrice', type: 'number', required: false, description: 'Minimum price filter' },
      { name: 'maxPrice', type: 'number', required: false, description: 'Maximum price filter' },
      { name: 'preferences', type: 'string', required: false, description: 'Free-text preference description' },
    ],
  },
  {
    name: 'calculateShipping',
    description: 'Look up the delivery cost for a wilaya for this merchant',
    args: [{ name: 'wilaya', type: 'string', required: true, description: 'Wilaya (name or number) to calculate shipping for' }],
  },
  {
    name: 'getOrderStatus',
    description: 'Return the status and tracking number of the active or referenced order',
    args: [{ name: 'orderId', type: 'string', required: false, description: 'Order id to check' }],
  },
  {
    name: 'createOrder',
    description: 'Create a new pending order (product, wilaya, commune, quantity), compute the total with delivery cost, and flag it as waiting for confirmation',
    args: [
      { name: 'productId', type: 'string', required: false, description: 'Product id to order' },
      { name: 'product', type: 'string', required: false, description: 'Product name to order' },
      { name: 'wilaya', type: 'string', required: false, description: 'Delivery wilaya' },
      { name: 'commune', type: 'string', required: true, description: 'Delivery commune (baladia)' },
      { name: 'quantity', type: 'integer', required: false, description: 'Quantity to order (default 1)' },
    ],
  },
  {
    name: 'confirmOrder',
    description: 'Confirm the pending order waiting for confirmation, or a pending order the customer references explicitly',
    args: [
      { name: 'orderId', type: 'string', required: false, description: 'Order id to confirm' },
      { name: 'productName', type: 'string', required: false, description: 'Product name to confirm the order for' },
    ],
  },
  {
    name: 'modifyOrder',
    description: "Update a pending order's quantity, wilaya, or commune and recompute the total",
    args: [
      { name: 'wilaya', type: 'string', required: false, description: 'New delivery wilaya' },
      { name: 'commune', type: 'string', required: false, description: 'New delivery commune' },
      { name: 'quantity', type: 'integer', required: false, description: 'New quantity' },
    ],
  },
  {
    name: 'cancelOrder',
    description: 'Cancel the active or referenced pending order',
    args: [
      { name: 'orderId', type: 'string', required: false, description: 'Order id to cancel' },
      { name: 'productName', type: 'string', required: false, description: 'Product name to cancel the order for' },
    ],
  },
  {
    name: 'escalateConversation',
    description: 'Hand the conversation to a human agent (idempotent)',
    args: [],
  },
];