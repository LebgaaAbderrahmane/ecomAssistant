import express, {Router} from 'express'
import authRoutes from "../modules/auth/auth.routes"
import storeConnectionRoutes from "../modules/storeConnections"
import ordersRoutes from "../modules/orders/orders.routes"
import whatsappRoutes from "../modules/whatsapp/whatsapp.routes"
import messagesRoutes from "../modules/fakeMessages/fakeMessage.routes"

const router: Router = express.Router()

router.use('/auth', authRoutes);
router.use('/orders', ordersRoutes)
router.use('/store-connection', storeConnectionRoutes)
router.use('/whatsapp', whatsappRoutes)
router.use('/messages', messagesRoutes)

export default router;
