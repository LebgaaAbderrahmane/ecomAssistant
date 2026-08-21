import axios from 'axios'
import { AbstractDeliveryProvider } from './AbstractDeliveryProvider.js'
import type { ParcelInput, ParcelResult, TrackingStatus, FeeQuery } from './types.js'
import { moduleLogger } from '../../../lib/logger'

const log = moduleLogger('delivery.yalidine')

const BASE_URL = 'https://api.yalidine.app/v1'

interface YalidineParcelResponse {
  id: string
  tracking: string
  label_url?: string
}

interface YalidineTrackingResponse {
  tracking: string
  status: string
  date_status: string
  center_name?: string
  wilaya_name?: string
  commune_name?: string
}

export class YalidineProvider extends AbstractDeliveryProvider {
  private get client() {
    return axios.create({
      baseURL: BASE_URL,
      headers: {
        'X-API-ID': this.apiId,
        'X-API-Token': this.apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }

  async connect(): Promise<boolean> {
    try {
      await this.client.get('/centers', { params: { wilaya_id: 16 } })
      return true
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      log.error({ status, data: JSON.stringify(data) || err?.message || err }, 'connect failed')
      return false
    }
  }

  async disconnect(): Promise<void> {
  }

  async createParcel(order: ParcelInput): Promise<ParcelResult> {
    try {
      const { data } = await this.client.post<YalidineParcelResponse>('/parcels', {
      order_id: order.platformOrderId,
      from_wilaya_name: 'Alger',
      firstname: order.firstName,
      familyname: order.familyName,
      contact_phone: order.phone,
      address: order.address,
      to_commune_name: order.commune,
      to_wilaya_name: order.wilaya,
      product_list: order.productList,
      price: order.price,
      weight: order.weight ?? 0.5,
      length: order.length ?? 10,
      width: order.width ?? 10,
      height: order.height ?? 10,
      freeshipping: order.freeShipping ?? false,
      is_stopdesk: order.isStopDesk ?? false,
      stopdesk_id: order.stopDeskId,
      do_insurance: order.doInsurance ?? false,
      declared_value: order.declaredValue,
      has_exchange: order.hasExchange ?? false,
      product_to_collect: order.productToCollect,
      })

      return {
        trackingNumber: data.tracking,
        labelUrl: data.label_url,
      }
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      log.error({ status, data: JSON.stringify(data) || err?.message || err }, 'createParcel failed')
      throw new Error(data?.message || err?.message || 'Yalidine API error')
    }
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    try {
      const { data } = await this.client.get<YalidineTrackingResponse[]>(`/parcels/${trackingNumber}`)

      const events = data.map((e) => ({
        date: e.date_status,
        status: e.status,
        location: [e.center_name, e.wilaya_name, e.commune_name].filter(Boolean).join(', '),
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
      log.error({ status, data: JSON.stringify(data) || err?.message || err }, 'getTracking failed')
      throw new Error(data?.message || err?.message || 'Yalidine API error')
    }
  }

  async getFee(query: FeeQuery): Promise<number> {
    const { data } = await this.client.get<{ fee: number }>('/fees', {
      params: {
        to_wilaya_name: query.toWilaya,
        from_wilaya_name: query.fromWilaya,
        weight: query.weight,
      },
    })
    return data.fee
  }

  verifyWebhookSignature(_payload: Buffer, _signature: string): boolean {
    return true
  }
}
