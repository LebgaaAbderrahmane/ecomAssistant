import { Router } from "express";
import * as controller from "./whatsapp.controller";
import * as conversationController from "./conversation.controller";
import { authenticate } from "../../middlwares/auth.middlware";

const router = Router();

router.post("/webhook", controller.handleWebhook);
router.post("/session", authenticate, controller.createSession);
router.get("/session/status", authenticate, controller.getSessionStatus);
router.delete("/session", authenticate, controller.deleteSession);
router.post("/send", authenticate, controller.sendMessage);
router.post("/conversations/:id/read", authenticate, controller.markAsRead);

router.get("/conversations", authenticate, conversationController.listConversations);
router.get("/conversations/:id", authenticate, conversationController.getConversation);

export default router;
