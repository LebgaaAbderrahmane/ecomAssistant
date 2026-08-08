import axios from 'axios'
import { getWilayaCode } from '@ecomassistant/shared'
import { AbstractDeliveryProvider } from './AbstractDeliveryProvider.js'
import type { ParcelInput, ParcelResult, TrackingStatus, FeeQuery, WebhookEvent } from './types.js'

const BASE_URL = 'https://backend.maystro-delivery.com/api/'
const MAYSTRO_SOURCE_ID = 4

interface MaystroCommune {
  id: number
  wilaya: number
  name: string
}

interface MaystroOrderResponse {
  tracking?: string
  display_id_order?: string
  success?: boolean
  errors?: string[]
}

const MAYSTRO_STATUS: Record<number, WebhookEvent['status']> = {
  15: 'shipped',
  41: 'delivered',
  50: 'cancelled',
  55: 'returned',
}

const normalizeCommune = (name: string): string =>
  name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ' ').replace(/\s+/g, ' ').trim()

export class MaystroProvider extends AbstractDeliveryProvider {
  private get client() {
    return axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: `Token ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }

  async connect(): Promise<boolean> {
    try {
      const res = await this.client.get('/shared/wilayas/', { params: { country: 1, language: 'en' } })
      return res.status === 200
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      console.error(`[Maystro] connect failed (status=${status}):`, JSON.stringify(data) || err?.message || err)
      return false
    }
  }

  async disconnect(): Promise<void> {
  }

  private async resolveCommuneId(wilaya: number, communeName: string): Promise<number> {
    const { data } = await this.client.get<MaystroCommune[]>('/shared/communes/', { params: { wilaya } })
    const target = normalizeCommune(communeName)
    const found = Array.isArray(data) ? data.find((c) => normalizeCommune(c.name) === target) : undefined
    if (!found) {
      throw new Error(`Maystro: commune "${communeName}" not found for wilaya ${wilaya}`)
    }
    return found.id
  }

  async createParcel(order: ParcelInput): Promise<ParcelResult> {
    const wilaya = getWilayaCode(order.wilaya)
    if (!wilaya) {
      throw new Error(`Maystro: unknown wilaya "${order.wilaya}"`)
    }

    const payload = {
      wilaya,
      commune: await this.resolveCommuneId(wilaya, order.commune),
      destination_text: order.address,
      customer_phone: order.phone,
      customer_name: `${order.firstName} ${order.familyName}`.trim(),
      product_price: Math.round(order.price),
      delivery_type: order.isStopDesk ? 1 : 0,
      express: false,
      note_to_driver: '',
      products: [
        {
          description: order.productList,
          quantity: 1,
        },
      ],
      source: MAYSTRO_SOURCE_ID,
      external_order_id: order.platformOrderId,
    }

    try {
      const { data } = await this.client.post<MaystroOrderResponse | MaystroOrderResponse[]>('/app/orders/', payload)
      const orderRes = Array.isArray(data) ? data[0] : data

      if (!orderRes?.success || orderRes.errors?.length) {
        const detail = orderRes?.errors?.join(', ') || JSON.stringify(data)
        throw new Error(`Maystro: ${detail}`)
      }

      return {
        trackingNumber: orderRes.tracking || orderRes.display_id_order || '',
        labelUrl: undefined,
      }
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      if (err?.message?.startsWith('Maystro:')) {
        throw err
      }
      console.error(`[Maystro] createParcel failed (status=${status}):`, JSON.stringify(data) || err?.message || err)
      throw new Error(data?.message || err?.message || 'Maystro API error')
    }
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    try {
      const { data } = await this.client.get<Record<string, any>>(`/app/orders/${trackingNumber}/`)
      const statusCode = Number(data?.status)
      const history = [
        {
          date: data?.last_update || data?.updated_at || '',
          status: statusCode ? String(statusCode) : 'unknown',
          location: undefined,
          reason: data?.abort_reason || undefined,
        },
      ]

      return {
        tracking: trackingNumber,
        status: history[0].status,
        lastUpdate: history[0].date,
        history,
      }
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      console.error(`[Maystro] getTracking failed (status=${status}):`, JSON.stringify(data) || err?.message || err)
      throw new Error(data?.message || err?.message || 'Maystro API error')
    }
  }

  async getFee(_query: FeeQuery): Promise<number> {
    return 0
  }

  verifyWebhookSignature(payload: Buffer, _signature: string): boolean {
    try {
      const raw = JSON.parse(payload.toString('utf8'))
      const data = raw?.message?.data
      if (typeof data !== 'string') return false
      const decodedOnce = Buffer.from(data, 'base64').toString('utf8')
      const decodedTwice = Buffer.from(decodedOnce, 'base64').toString('utf8')
      const parsed = JSON.parse(decodedTwice)
      return typeof parsed?.event === 'string' && !!parsed?.payload
    } catch {
      return false
    }
  }

  parseWebhook(_payload: string, body: unknown): WebhookEvent | null {
    const decoded = this.decodeDoubleBase64(body)
    if (!decoded) return null

    const rawStatus = Number(decoded.payload?.status)
    const status = MAYSTRO_STATUS[rawStatus]
    if (!status) return null

    const tracking = decoded.payload?.display_id_order || decoded.payload?.external_order_id
    if (!tracking) return null

    return {
      tracking: String(tracking),
      status,
      rawStatus: String(rawStatus),
      date: decoded.payload?.last_update || decoded.payload?.delivered_at,
    }
  }

  private decodeDoubleBase64(body: unknown): any {
    try {
      if (!body) return null
      const wrapper = typeof body === 'string' ? JSON.parse(body) : body
      const data = wrapper?.message?.data
      if (typeof data !== 'string') return null
      const first = Buffer.from(data, 'base64').toString('utf8')
      const second = Buffer.from(first, 'base64').toString('utf8')
      return JSON.parse(second)
    } catch {
      return null
    }
  }
}