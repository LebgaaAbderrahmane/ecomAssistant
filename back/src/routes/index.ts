import express, {Router} from 'express'
import authRoutes from "./auth.routes"
import whatsappRoutes from "./whatsapp.routes"

const router: Router = express.Router()

router.use('/auth', authRoutes);
router.use('/whatsapp', whatsappRoutes);

export default router;
