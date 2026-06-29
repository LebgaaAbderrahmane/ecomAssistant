import express, {Router} from 'express'
import authRoutes from "../modules/auth/auth.routes"
import storeConnectionRoutes from "../modules/storeConnections"
import ordersRoutes from "../modules/orders/orders.routes"

const router: Router = express.Router()

router.use('/auth', authRoutes);
router.use('/orders', ordersRoutes)
router.use('/store-connection', storeConnectionRoutes)

export default router;
