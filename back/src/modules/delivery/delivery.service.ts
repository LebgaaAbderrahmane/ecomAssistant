import prisma from '../../config/db.config.js'
import { ProviderFactory } from './providers/ProviderFactory.js'
import type { ParcelInput, ShipOrderInput, WebhookEvent } from './providers/types.js'
import { sendDeliveryStatusNotification } from '../whatsapp/whatsapp.controller.js'

export const deliveryService = {
  async getConfig(merchantId: string) {
    return prisma.deliveryProviderConfig.findUnique({ where: { merchantId } })
  },

  async connectProvider(merchantId: string, provider: string, apiId: string, apiToken: string) {
    const driver = ProviderFactory.create(provider, merchantId, apiId, apiToken)
    const isConnected = await driver.connect()

    if (!isConnected) {
      throw new Error(`Failed to connect to ${provider} — check your API credentials`)
    }

    await prisma.deliveryProviderConfig.upsert({
      where: { merchantId },
      create: { merchantId, provider, apiId, apiToken, isConnected: true },
      update: { provider, apiId, apiToken, isConnected: true },
    })

    return { connected: true }
  },

  async disconnectProvider(merchantId: string) {
    await prisma.deliveryProviderConfig.deleteMany({ where: { merchantId } })
  },

  async shipOrder(merchantId: string, orderId: string, overrides?: ShipOrderInput) {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true },
    })
    if (!order) {
      throw new Error('Order not found')
    }
    if (order.merchantId !== merchantId) {
      throw new Error('Order does not belong to this merchant')
    }

    const customerName = order.customer?.name ?? ''
    const nameParts = customerName.split(' ')
    const firstName = nameParts[0] || ''
    const familyName = nameParts.slice(1).join(' ') || ''

    const input: ParcelInput = {
      orderId: order.id,
      platformOrderId: order.platformOrderId,
      firstName,
      familyName,
      phone: order.customer?.phone ?? '',
      address: order.address ?? '',
      wilaya: order.wilaya,
      commune: order.commune ?? '',
      productList: `${order.productName} x${order.quantity}`,
      price: order.totalAmount,
      weight: overrides?.weight ?? 0.5,
      length: overrides?.length ?? 10,
      width: overrides?.width ?? 10,
      height: overrides?.height ?? 10,
      freeShipping: overrides?.freeShipping ?? false,
      isStopDesk: overrides?.isStopDesk ?? false,
      stopDeskId: overrides?.stopDeskId,
      doInsurance: overrides?.doInsurance ?? false,
      declaredValue: overrides?.declaredValue,
      hasExchange: overrides?.hasExchange ?? false,
      productToCollect: overrides?.productToCollect,
    }

    return this.createParcel(merchantId, input)
  },

  async createParcel(merchantId: string, input: ParcelInput) {
    const config = await prisma.deliveryProviderConfig.findUnique({ where: { merchantId } })
    if (!config || !config.isConnected) {
      throw new Error('No delivery provider connected')
    }

    const driver = ProviderFactory.create(config.provider, merchantId, config.apiId!, config.apiToken!)
    const result = await driver.createParcel(input)

    await prisma.order.update({
      where: { id: input.orderId },
      data: { trackingNumber: result.trackingNumber, deliveryProvider: config.provider },
    })

    return result
  },

  async getTracking(merchantId: string, trackingNumber: string) {
    const config = await prisma.deliveryProviderConfig.findUnique({ where: { merchantId } })
    if (!config || !config.isConnected) {
      throw new Error('No delivery provider connected')
    }

    const driver = ProviderFactory.create(config.provider, merchantId, config.apiId!, config.apiToken!)
    return driver.getTracking(trackingNumber)
  },

  async handleWebhook(provider: string, payload: Buffer, body: unknown) {
    const configs = await prisma.deliveryProviderConfig.findMany({
      where: { provider, isConnected: true },
      include: { merchant: true },
    })

    for (const config of configs) {
      const driver = ProviderFactory.create(config.provider, config.merchantId, config.apiId!, config.apiToken!)
      if (!driver.verifyWebhookSignature(payload, '')) continue

      const event = driver.parseWebhook(payload.toString('utf8'), body)
      if (!event) continue

      const order = await prisma.order.findFirst({
        where: {
          merchantId: config.merchantId,
          OR: [
            { trackingNumber: event.tracking },
            { platformOrderId: event.tracking },
          ],
        },
        include: { customer: true, merchant: true },
      })
      if (!order) continue

      const statusMap: Partial<Record<WebhookEvent['status'], 'SHIPPED' | 'DELIVERED' | 'CANCELLED'>> = {
        shipped: 'SHIPPED',
        delivered: 'DELIVERED',
        returned: 'CANCELLED',
        cancelled: 'CANCELLED',
      }
      const newStatus = statusMap[event.status]
      if (!newStatus) continue

      await prisma.order.update({
        where: { id: order.id },
        data: { status: newStatus },
      })

      if (event.status === 'shipped' || event.status === 'delivered') {
        await sendDeliveryStatusNotification({
          orderId: order.id,
          merchantId: order.merchantId,
          customerId: order.customerId,
          customerName: order.customer?.name ?? '',
          customerPhone: order.customer?.phone ?? '',
          productName: order.productName,
          platformOrderId: order.platformOrderId,
          totalAmount: order.totalAmount,
          wilaya: order.wilaya,
          trackingNumber: order.trackingNumber ?? event.tracking,
          status: event.status,
          provider,
        })
      }

      return { received: true, orderId: order.id, status: event.status }
    }

    return { received: true, processed: false }
  },
}
