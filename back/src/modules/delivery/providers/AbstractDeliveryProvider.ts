import type { ParcelInput, ParcelResult, TrackingStatus, FeeQuery } from './types.js'

export abstract class AbstractDeliveryProvider {
  protected merchantId: string
  protected apiId: string
  protected apiToken: string

  constructor(merchantId: string, apiId: string, apiToken: string) {
    this.merchantId = merchantId
    this.apiId = apiId
    this.apiToken = apiToken
  }

  abstract connect(): Promise<boolean>

  abstract disconnect(): Promise<void>

  abstract createParcel(order: ParcelInput): Promise<ParcelResult>

  abstract getTracking(trackingNumber: string): Promise<TrackingStatus>

  abstract getFee(query: FeeQuery): Promise<number>

  abstract verifyWebhookSignature(payload: Buffer, signature: string): boolean
}
