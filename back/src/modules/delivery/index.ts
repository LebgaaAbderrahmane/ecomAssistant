import { Router } from 'express'
import deliveryRoutes from './delivery.routes.js'

const router: Router = Router()
router.use('/', deliveryRoutes)

export default router
