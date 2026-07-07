import express, {Router} from "express";
import * as controller from "./fakeMessages.controller";
import { FakeMessageSchema } from "../../validators/messages.validator";
import { validate } from "../../middlwares/validation.middleware";

const router: Router = express.Router();

router.post("/fake-messages", validate(FakeMessageSchema), controller.postFakeMessage);

export default router;