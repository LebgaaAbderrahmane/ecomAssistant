import { Router } from "express";
import * as controller from "./products.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router = Router();

router.get("/", authenticate, controller.listProducts);

export default router;
