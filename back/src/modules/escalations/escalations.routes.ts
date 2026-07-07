import { Router } from "express";
import * as controller from "./escalations.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router = Router();

router.get("/", authenticate, controller.listEscalations);
router.post("/:id/resolve", authenticate, controller.resolve);
router.post("/resolve-all", authenticate, controller.resolveAll);

export default router;
