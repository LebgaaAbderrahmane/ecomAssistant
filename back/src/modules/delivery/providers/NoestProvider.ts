import axios from 'axios'
import { getWilayaCode } from '@ecomassistant/shared'
import { AbstractDeliveryProvider } from './AbstractDeliveryProvider.js'
import type { ParcelInput, ParcelResult, TrackingStatus, FeeQuery } from './types.js'

const BASE_URL = 'https://app.noest-dz.com'

interface NoestCreatePayload {
  user_guid: string
  reference?: string
  client: string
  phone: string
  adresse: string
  wilaya_id: number
  commune: string
  montant: number
  produit: string
  type_id: 1 | 2 | 3
  stop_desk: 0 | 1
  station_code?: string
  poids?: number
}

interface NoestCreateResult {
  success: boolean
  tracking?: string
  reference?: string
  [key: string]: unknown
}

interface NoestTrackingEvent {
  event: string
  date: string
  causer?: string
  [key: string]: unknown
}

interface NoestTrackingResult {
  OrderInfo?: Record<string, unknown>
  activity?: NoestTrackingEvent[]
  [key: string]: unknown
}

const normalizePhone = (phone: string): string => {
  let p = phone.replace(/\s+/g, '').replace(/[^0-9+]/g, '')
  if (p.startsWith('+213')) p = '0' + p.slice(4)
  else if (p.startsWith('213')) p = '0' + p.slice(3)
  return p
}

const isDeliveryEvent = (event: string): boolean => {
  const finance = ['pay', 'payment', 'cash', 'collect', 'frais', 'remise', 'recharge']
  return !finance.some((k) => event.toLowerCase().includes(k))
}

export class NoestProvider extends AbstractDeliveryProvider {
  private get client() {
    return axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }

  async connect(): Promise<boolean> {
    try {
      const res = await this.client.get('/api/public/get/wilayas')
      return Array.isArray(res.data)
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      console.error(`[NOEST] connect failed (status=${status}):`, JSON.stringify(data) || err?.message || err)
      return false
    }
  }

  async disconnect(): Promise<void> {
  }

  async createParcel(order: ParcelInput): Promise<ParcelResult> {
    const wilayaId = getWilayaCode(order.wilaya)
    if (!wilayaId) {
      throw new Error(`NOEST: unknown wilaya "${order.wilaya}"`)
    }

    const payload: NoestCreatePayload = {
      user_guid: this.apiId,
      reference: order.platformOrderId,
      client: `${order.firstName} ${order.familyName}`.trim(),
      phone: normalizePhone(order.phone),
      adresse: order.address,
      wilaya_id: wilayaId,
      commune: order.commune,
      montant: Math.round(order.price),
      produit: order.productList,
      type_id: 1,
      stop_desk: order.isStopDesk ? 1 : 0,
      station_code: order.isStopDesk ? order.stopDeskId?.toString() : undefined,
      poids: order.weight,
    }

    try {
      const { data } = await this.client.post<NoestCreateResult>('/api/public/create/order', payload)

      if (!data?.success || !data.tracking) {
        throw new Error(data?.message ? `NOEST: ${data.message}` : 'NOEST: failed to create parcel')
      }

      const tracking = data.tracking

      const validation = await this.client.post<{ success: boolean }>('/api/public/valid/order', {
        user_guid: this.apiId,
        tracking,
      })
      if (!validation.data?.success) {
        throw new Error(`NOEST: created but validation failed for tracking ${tracking}`)
      }

      return {
        trackingNumber: tracking,
        labelUrl: undefined,
      }
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      if (err?.message?.startsWith('NOEST:')) {
        throw err
      }
      console.error(`[NOEST] createParcel failed (status=${status}):`, JSON.stringify(data) || err?.message || err)
      throw new Error(data?.message || err?.message || 'NOEST API error')
    }
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    try {
      const { data } = await this.client.post<Record<string, NoestTrackingResult>>('/api/public/get/trackings/info', {
        trackings: [trackingNumber],
      })

      const result = data?.[trackingNumber]
      if (!result) {
        throw new Error(`NOEST: tracking ${trackingNumber} not found`)
      }

      const events = (result.activity ?? [])
        .filter((e) => isDeliveryEvent(e.event))
        .map((e) => ({
          date: e.date,
          status: e.event,
          location: undefined,
          reason: e.causer,
        }))

      return {
        tracking: trackingNumber,
        status: events[0]?.status ?? 'unknown',
        lastUpdate: events[0]?.date ?? '',
        history: events,
      }
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      console.error(`[NOEST] getTracking failed (status=${status}):`, JSON.stringify(data) || err?.message || err)
      throw new Error(data?.message || err?.message || 'NOEST API error')
    }
  }

  async getFee(query: FeeQuery): Promise<number> {
    const wilayaId = getWilayaCode(query.toWilaya)
    if (!wilayaId) return 0
    try {
      const { data } = await this.client.get<Array<Record<string, unknown>>>('/api/public/fees')
      const row = Array.isArray(data) ? data.find((f) => Number(f.wilaya_id) === wilayaId) : undefined
      return typeof row?.fees === 'number' ? (row.fees as number) : 0
    } catch (err: any) {
      console.error(`[NOEST] getFee failed:`, err?.message || err)
      return 0
    }
  }

  verifyWebhookSignature(_payload: Buffer, _signature: string): boolean {
    return true
  }
}