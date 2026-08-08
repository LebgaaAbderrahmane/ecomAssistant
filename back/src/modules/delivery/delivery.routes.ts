import { Router } from 'express'
import { authenticate } from '../../middlwares/auth.middlware.js'
import * as controller from './delivery.controller.js'

const router = Router()

router.get('/status', authenticate, controller.getStatus)
router.get('/providers', authenticate, controller.getProviders)
router.get('/config', authenticate, controller.getConfig)
router.post('/connect', authenticate, controller.connectProvider)
router.post('/disconnect', authenticate, controller.disconnectProvider)
router.post('/ship-order/:orderId', authenticate, controller.shipOrder)
router.post('/parcels', authenticate, controller.createParcel)
router.get('/tracking/:trackingNumber', authenticate, controller.getTracking)
router.post('/webhook/:provider', controller.handleWebhook)

export default router
