// ---------------------------------------------------------------------------
// Flow state machine types
// ---------------------------------------------------------------------------

export type FlowState =
  | 'IDLE'
  | 'PRODUCT_DISCOVERY'
  | 'PRODUCT_SELECTED'
  | 'ORDER_PENDING'
  | 'ORDER_CONFIRMED'
  | 'ORDER_SHIPPED'
  | 'ORDER_CANCELLED'
  | 'FINISHED';

export interface FlowVariant {
  id: string;
  name: string;
  price: number;
  sku?: string;
  stock?: number;
  options?: Record<string, string>;
}

export interface FlowProduct {
  productId: string;
  productName: string;
  /** Base/"starting from" price shown before a variant is picked — the price
   *  that actually applies at order time is always FlowVariant.price. */
  price: number;
  variants: FlowVariant[];
}

export interface FlowFilter {
  category?: string;
  color?: string;
  size?: string;
  minPrice?: number;
  maxPrice?: number;
  /** Unstructured leftover from NLU (Darija free text) that didn't map to a
   *  structured filter above. Not matched against structurally — kept for
   *  context/logging/re-ranking only. */
  freeText?: string;
}

export interface ProductDiscoveryData {
  input: {
    productName: string;
    filters: FlowFilter;
  };
  toolResults: FlowProduct[];
}

export interface OrderData {
  orderId?: string;
  productId?: string;
  quantity?: number;
}

export interface ShippingData {
  method?: string;
  cost?: number;
  address?: string;
}

interface FlowBase {
  flowId: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Discriminated union on `state`: each state carries exactly the data that
 * is actually guaranteed to exist at that point in the flow. This makes
 * "ORDER_CONFIRMED but no order data" unrepresentable — the compiler
 * enforces it instead of a runtime null-check.
 */
export type Flow =
  | (FlowBase & { state: 'IDLE' })
  | (FlowBase & {
      state: 'PRODUCT_DISCOVERY';
      productDiscovery: ProductDiscoveryData;
    })
  | (FlowBase & {
      state: 'PRODUCT_SELECTED';
      productDiscovery: ProductDiscoveryData;
    })
  | (FlowBase & {
      state: 'ORDER_PENDING';
      productDiscovery: ProductDiscoveryData;
      order: OrderData;
    })
  | (FlowBase & {
      state: 'ORDER_CONFIRMED';
      productDiscovery: ProductDiscoveryData;
      order: OrderData;
      shipping: ShippingData;
    })
  | (FlowBase & {
      state: 'ORDER_SHIPPED';
      productDiscovery: ProductDiscoveryData;
      order: OrderData;
      shipping: ShippingData;
    })
  | (FlowBase & {
      state: 'ORDER_CANCELLED';
      productDiscovery: ProductDiscoveryData;
      order: OrderData;
      shipping?: ShippingData;
    })
  | (FlowBase & {
      state: 'FINISHED';
      productDiscovery: ProductDiscoveryData;
      order: OrderData;
      shipping: ShippingData;
    });

// ---------------------------------------------------------------------------
// Conversation memory types
// ---------------------------------------------------------------------------

export const CURRENT_MEMORY_VERSION = 1;

export interface ConversationMemory {
  version: number;
  globalInformation: {
    customerName?: string;
    wilaya?: string;
    commune?: string;
  };
  flows: Flow[];
  activeFlow?: string;
  recentIntents?: string[];
}

// ---------------------------------------------------------------------------
// Deprecated — kept for backward compat during migration, remove once no
// persisted memory can still contain the pre-Flow shape.
// ---------------------------------------------------------------------------

/** @deprecated Use FlowProduct instead. */
export interface ProductResult {
  id: string;
  name: string;
}

/** @deprecated */
export interface IntentSummary {
  intent: string;
  entities: Record<string, string | number | boolean | null>;
}