import express, {Router} from "express"
import {authenticate} from "../middlewares/auth.middlware"
import * as controller from "../controllers/shopify.controller"
import { validate } from "../middlewares/validation.middleware";
import { shopifyAuthSchema } from "../validators/shopify.validator"
import { generateInstallUrl } from "../services/shopify.service"
const router:Router = express.Router();

router.get("/install",validate(shopifyAuthSchema,"query"), controller.authenticateShopify)
router.get("/callback", controller.callBack);
router.post("/webhooks/orders",authenticate, controller.handleOrderWebhook);
router.post("/disconnect", authenticate, controller.disconnect);

export default router;