import axios from 'axios'
import { getWilayaCode } from '@ecomassistant/shared'
import { AbstractDeliveryProvider } from './AbstractDeliveryProvider.js'
import type { ParcelInput, ParcelResult, TrackingStatus, FeeQuery } from './types.js'
import { moduleLogger } from '../../../lib/logger'

const log = moduleLogger('delivery.procolis')

const BASE_URL = 'https://procolis.com/api_v1'

interface ProcolisColisResponse {
  Colis: Array<Record<string, any>>
}

interface ProcolisTarifRow {
  IDWilaya?: number
  Normal?: number | string
  Domicile?: number | string
  [key: string]: any
}

export class ProcolisProvider extends AbstractDeliveryProvider {
  private get client() {
    return axios.create({
      baseURL: BASE_URL,
      headers: {
        token: this.apiId,
        key: this.apiToken,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    })
  }

  async connect(): Promise<boolean> {
    try {
      const { data } = await this.client.get<{ Statut?: string }>('/token')
      return data?.Statut === 'Accès activé'
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
    const wilayaCode = getWilayaCode(order.wilaya)
    if (!wilayaCode) {
      throw new Error(`Procolis: unknown wilaya "${order.wilaya}"`)
    }

    const colis = {
      Tracking: '',
      TypeLivraison: order.isStopDesk ? 1 : 0,
      TypeColis: order.hasExchange ? 1 : 0,
      Confirmee: 1,
      Client: `${order.firstName} ${order.familyName}`.trim(),
      MobileA: order.phone,
      MobileB: '',
      Adresse: order.address,
      IDWilaya: wilayaCode,
      Commune: order.commune,
      Total: order.price,
      Note: '',
      TProduit: order.productList,
      id_Externe: order.platformOrderId,
      Source: '',
    }

    try {
      const { data } = await this.client.post<ProcolisColisResponse>('/add_colis', { Colis: [colis] })
      const created = data?.Colis?.[0]
      const message = created?.MessageRetour

      if (message === 'Double Tracking') {
        throw new Error(`Procolis: duplicate tracking for order ${order.platformOrderId}`)
      }
      if (message !== 'Good') {
        throw new Error(`Procolis: ${message || 'failed to create parcel'}`)
      }

      return {
        trackingNumber: String(created.Tracking),
        labelUrl: undefined,
      }
    } catch (err: any) {
      const status = err?.response?.status
      const data = err?.response?.data
      log.error({ status, data: JSON.stringify(data) || err?.message || err }, 'createParcel failed')
      throw new Error(data?.message || err?.message || 'Procolis API error')
    }
  }

  async getTracking(trackingNumber: string): Promise<TrackingStatus> {
    try {
      const { data } = await this.client.post<ProcolisColisResponse>('/lire', { Colis: [{ Tracking: trackingNumber }] })
      const colis = data?.Colis?.[0]

      if (!colis) {
        throw new Error(`Procolis: tracking ${trackingNumber} not found`)
      }

      const history = [
        {
          date: colis.Date || colis.DateStatut || '',
          status: colis.Statut || colis.Etat || 'unknown',
          location: colis.Wilaya || colis.Commune,
          reason: colis.MessageRetour,
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
      log.error({ status, data: JSON.stringify(data) || err?.message || err }, 'getTracking failed')
      throw new Error(data?.message || err?.message || 'Procolis API error')
    }
  }

  async getFee(query: FeeQuery): Promise<number> {
    try {
      const { data } = await this.client.post<ProcolisTarifRow[]>('/tarification')
      const row = Array.isArray(data) ? data.find((r) => r.IDWilaya === getWilayaCode(query.toWilaya)) : null
      const price = row?.Normal ?? row?.Domicile
      return typeof price === 'number' ? price : 0
    } catch (err: any) {
      log.error({ err: err?.message || err }, 'getFee failed')
      return 0
    }
  }

  verifyWebhookSignature(_payload: Buffer, _signature: string): boolean {
    return true
  }
}
