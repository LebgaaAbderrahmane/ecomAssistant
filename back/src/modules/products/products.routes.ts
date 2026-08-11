import { Router } from "express";
import * as controller from "./products.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router: Router = Router();

router.get("/", authenticate, controller.listProducts);
router.get("/ids", authenticate, controller.getProductIds);
router.patch("/bulk-agent", authenticate, controller.patchBulkAgent);

export default router;
