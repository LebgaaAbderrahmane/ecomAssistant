import { Router } from "express";
import * as controller from "./customers.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router: Router = Router();

router.get("/", authenticate, controller.listCustomers);
router.get("/ids", authenticate, controller.getCustomerIds);
router.patch("/bulk-block", authenticate, controller.patchBulkBlock);

export default router;
