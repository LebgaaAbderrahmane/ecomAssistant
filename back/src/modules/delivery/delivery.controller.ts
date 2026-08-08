import { Response } from 'express'
import { DELIVERY_PROVIDERS, DeliveryProviderKey } from '@ecomassistant/shared'
import { AuthenticatedRequest } from '../../middlwares/auth.middlware.js'
import { deliveryService } from './delivery.service.js'

export const getStatus = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  const config = await deliveryService.getConfig(merchantId)
  res.json({
    connected: !!config?.isConnected,
    provider: config?.provider ?? null,
  })
}

export const getProviders = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  const config = await deliveryService.getConfig(merchantId)
  const providers = DELIVERY_PROVIDERS.map((p) => ({
    key: p.key,
    connected: config?.provider === p.key && !!config?.isConnected,
    available: p.available,
  }))
  res.json(providers)
}

export const getConfig = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  const config = await deliveryService.getConfig(merchantId)
  res.json({
    provider: config?.provider ?? null,
    isConnected: config?.isConnected ?? false,
  })
}

export const connectProvider = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  const { provider, apiId, apiToken } = req.body

  if (!provider || !apiId || !apiToken) {
    res.status(400).json({ message: 'provider, apiId, and apiToken are required' })
    return
  }

  try {
    const result = await deliveryService.connectProvider(merchantId, provider, apiId, apiToken)
    res.json({ message: 'Connected successfully', provider })
  } catch (err: any) {
    res.status(400).json({ message: err.message || 'Connection failed' })
  }
}

export const disconnectProvider = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  await deliveryService.disconnectProvider(merchantId)
  res.json({ message: 'Disconnected' })
}

export const shipOrder = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  const { orderId } = req.params

  try {
    const result = await deliveryService.shipOrder(merchantId, orderId, req.body)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ message: err.message })
  }
}

export const createParcel = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId

  try {
    const result = await deliveryService.createParcel(merchantId, req.body)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ message: err.message })
  }
}

export const getTracking = async (req: AuthenticatedRequest, res: Response) => {
  const merchantId = req.merchant!.merchantId
  const { trackingNumber } = req.params

  try {
    const result = await deliveryService.getTracking(merchantId, trackingNumber)
    res.json(result)
  } catch (err: any) {
    res.status(400).json({ message: err.message })
  }
}
