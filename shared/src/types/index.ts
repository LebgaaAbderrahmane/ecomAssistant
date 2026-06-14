// ─── Enums ───────────────────────────────────────────

export type OrderStatus = 'pending' | 'confirmed' | 'cancelled' | 'failed'
export type ConversationStatus = 'active' | 'waiting' | 'confirmed' | 'cancelled' | 'escalated' | 'expired'
export type Language = 'derdja' | 'french' | 'arabic'
export type AgentTone = 'formal' | 'friendly'
export type StorePlatform = 'shopify' | 'woocommerce'
export type DeliveryProvider = 'yalidine' | 'procolis'
export type FollowUpStep = 1 | 2 | 3

// ─── Merchant ────────────────────────────────────────

export interface Merchant {
  id: string
  email: string
  name: string
  createdAt: Date
  updatedAt: Date
}

// ─── Store ───────────────────────────────────────────

export interface StoreConnection {
  id: string
  merchantId: string
  platform: StorePlatform
  storeName: string
  storeUrl: string
  isConnected: boolean
  lastSyncAt: Date | null
  createdAt: Date
}

// ─── Agent Config ────────────────────────────────────

export interface AgentConfig {
  id: string
  merchantId: string
  defaultLanguage: Language | 'auto'
  tone: AgentTone
  followUpDelays: [number, number, number]
  maxFollowUps: 1 | 2 | 3
  deliveryProvider: DeliveryProvider | null
  isActive: boolean
  updatedAt: Date
}

// ─── Product ─────────────────────────────────────────

export interface Product {
  id: string
  merchantId: string
  platformProductId: string
  name: string
  description: string
  price: number
  currency: string
  images: string[]
  variants: ProductVariant[]
  stockStatus: 'in_stock' | 'out_of_stock' | 'backordered'
  category: string | null
  createdAt: Date
}

export interface ProductVariant {
  id: string
  name: string
  price: number
  sku: string | null
  stock: number
}

// ─── Order ───────────────────────────────────────────

export interface Order {
  id: string
  merchantId: string
  platformOrderId: string
  customerName: string
  customerPhone: string
  wilaya: string
  commune: string | null
  address: string
  productId: string
  productName: string
  quantity: number
  totalAmount: number
  deliveryCost: number
  status: OrderStatus
  trackingNumber: string | null
  deliveryProvider: DeliveryProvider | null
  createdAt: Date
  updatedAt: Date
}

// ─── Conversation ────────────────────────────────────

export interface Conversation {
  id: string
  merchantId: string
  orderId: string
  customerPhone: string
  status: ConversationStatus
  language: Language
  followUpStep: FollowUpStep
  lastMessageAt: Date | null
  escalatedAt: Date | null
  takenOverByHuman: boolean
  createdAt: Date
}

export interface Message {
  id: string
  conversationId: string
  role: 'agent' | 'customer' | 'system'
  content: string
  contentType: 'text' | 'voice' | 'image'
  createdAt: Date
}

// ─── Delivery Cost Matrix ────────────────────────────

export interface WilayaDeliveryCost {
  merchantId: string
  wilaya: string
  wilayaCode: number
  cost: number
}

// ─── KPI Summary ─────────────────────────────────────

export interface MerchantKpi {
  merchantId: string
  totalOrders: number
  confirmedOrders: number
  cancelledOrders: number
  failedOrders: number
  confirmationRate: number
  avgConfirmationTimeMinutes: number
  pendingFollowUps: number
  periodStart: Date
  periodEnd: Date
}
