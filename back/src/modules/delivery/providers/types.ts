export interface ParcelInput {
  orderId: string
  platformOrderId: string
  firstName: string
  familyName: string
  phone: string
  address: string
  wilaya: string
  commune: string
  productList: string
  price: number
  weight?: number
  length?: number
  width?: number
  height?: number
  freeShipping?: boolean
  isStopDesk?: boolean
  stopDeskId?: number
  doInsurance?: boolean
  declaredValue?: number
  hasExchange?: boolean
  productToCollect?: string
}

export interface ParcelResult {
  trackingNumber: string
  labelUrl?: string
}

export interface TrackingStatus {
  tracking: string
  status: string
  lastUpdate: string
  history: TrackingEvent[]
}

export interface TrackingEvent {
  date: string
  status: string
  location?: string
  reason?: string
}

export interface WebhookEvent {
  tracking: string
  status: 'shipped' | 'delivered' | 'returned' | 'cancelled' | 'unknown'
  rawStatus?: string
  date?: string
}

export interface ShipOrderInput {
  weight?: number
  length?: number
  width?: number
  height?: number
  freeShipping?: boolean
  isStopDesk?: boolean
  stopDeskId?: number
  doInsurance?: boolean
  declaredValue?: number
  hasExchange?: boolean
  productToCollect?: string
}

export interface FeeQuery {
  fromWilaya: string
  toWilaya: string
  weight: number
}
