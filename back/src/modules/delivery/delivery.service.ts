import prisma from '../../config/db.config.js'
import { ProviderFactory } from './providers/ProviderFactory.js'
import type { ParcelInput } from './providers/types.js'

export const deliveryService = {
  async getConfig(merchantId: string) {
    return prisma.deliveryProviderConfig.findUnique({ where: { merchantId } })
  },

  async connectProvider(merchantId: string, provider: string, apiId: string, apiToken: string) {
    const driver = ProviderFactory.create(provider, merchantId, apiId, apiToken)
    const isConnected = await driver.connect()

    if (!isConnected) {
      throw new Error('Failed to connect to Yalidine — check your API credentials')
    }

    await prisma.deliveryProviderConfig.upsert({
      where: { merchantId },
      create: { merchantId, provider, apiId, apiToken, isConnected: true },
      update: { provider, apiId, apiToken, isConnected: true },
    })

    return { connected: true }
  },

  async disconnectProvider(merchantId: string) {
    await prisma.deliveryProviderConfig.delete({ where: { merchantId } })
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
}
