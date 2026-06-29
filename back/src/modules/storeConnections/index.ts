import express, {Router} from "express";
import shopifyRoutes from "./shopify/shopify.routes"

const router:Router = express.Router()

router.use('/shopify', shopifyRoutes);
// later we can add wooCommerce routes easily 

export default router;