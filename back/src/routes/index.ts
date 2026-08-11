import express, {Router} from 'express'
import authRoutes from "../modules/auth/auth.routes"
import storeConnectionRoutes from "../modules/storeConnections"
import ordersRoutes from "../modules/orders/orders.routes"
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes"
import agentConfigRoutes from "../modules/agent-config/agent-config.routes"
import productsRoutes from "../modules/products/products.routes"
import customersRoutes from "../modules/customers/customers.routes"
import escalationsRoutes from "../modules/escalations/escalations.routes"
import messagesRoutes from "../modules/fakeMessages/fakeMessage.routes"
import billingRoutes from "../modules/billing/billing.routes"
import deliveryRoutes from "../modules/delivery/index"

const router: Router = express.Router()

router.use('/auth', authRoutes);
router.use('/orders', ordersRoutes)
router.use('/store-connection', storeConnectionRoutes)
router.use('/whatsapp', whatsappRoutes)
router.use('/agent-config', agentConfigRoutes)
router.use('/products', productsRoutes)
router.use('/customers', customersRoutes)
router.use('/escalations', escalationsRoutes)
router.use('/messages', messagesRoutes)
router.use('/billing', billingRoutes)
router.use('/delivery', deliveryRoutes)

export default router;
