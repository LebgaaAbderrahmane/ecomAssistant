import { Router } from "express";
import * as controller from "./customers.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router = Router();

router.get("/", authenticate, controller.listCustomers);

export default router;
