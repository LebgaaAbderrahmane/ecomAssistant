import express, {Router} from 'express'
import authRoutes from "./auth.routes"
import shopifyRoutes from "./shopify.routes"

const router: Router = express.Router()

router.use('/auth', authRoutes);
router.use('/shopify', shopifyRoutes)

export default router;
