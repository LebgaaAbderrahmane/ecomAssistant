import express, {Router} from "express"
import {authenticate} from "../../../middlwares/auth.middlware"
import * as controller from "./shopify.controller"
import { validate } from "../../../middlwares/validation.middleware";
import { shopifyAuthSchema } from "../../../validators/shopify.validator"


const router:Router = express.Router();

router.get("/authenticate",authenticate, validate(shopifyAuthSchema,"query"), controller.authenticateShopify)
router.get("/callback", controller.callBack); // called by shopify
router.post("/webhooks/orders", controller.handleOrderWebhook); // called by shopify 
router.post("/disconnect", authenticate, controller.disconnect);
router.get('/sync-orders', authenticate, controller.syncOrders);

export default router;