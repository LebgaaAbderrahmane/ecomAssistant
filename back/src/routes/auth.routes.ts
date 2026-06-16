import express, { Router } from "express";
import * as controller from "../controllers/auth.controller";
import { validate } from "../middlewares/validation.middleware";
import { signupSchema, verifyEmailSchema, loginSchema } from "../validators/auth.validator";

const router: Router = express.Router();

router.get("/me", controller.getMe);
router.post("/signup", validate(signupSchema, "body"), controller.signup);
router.post("/verify-email", validate(verifyEmailSchema, "body"), controller.verifyEmail);
router.post("/login", validate(loginSchema, "body"),controller.login);
export default router;