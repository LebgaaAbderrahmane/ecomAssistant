import { Router } from "express";
import * as controller from "./agent-config.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router = Router();

router.get("/", authenticate, controller.getConfig);
router.put("/", authenticate, controller.saveConfig);
router.post("/activate", authenticate, controller.activate);

export default router;
