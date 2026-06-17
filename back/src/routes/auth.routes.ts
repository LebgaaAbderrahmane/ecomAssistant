import express, { Router } from "express";
import * as controller from "../controllers/auth.controller";
import { validate } from "../middlewares/validation.middleware";
import { authenticate } from "../middlewares/auth.middlware";
import {
  signupSchema,
  verifyEmailSchema,
  loginSchema,
  forgetPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from "../validators/auth.validator";

const router: Router = express.Router();

router.get("/me", authenticate, controller.getMe);
router.post("/signup", validate(signupSchema, "body"), controller.signup);
router.post("/verify-email", validate(verifyEmailSchema, "body"), controller.verifyEmail);
router.post("/login", validate(loginSchema, "body"), controller.login);
router.post("/refresh", validate(refreshTokenSchema, "body"), controller.refresh);
router.post("/forgot-password", validate(forgetPasswordSchema, "body"), controller.forgetPassword);
router.post("/reset-password", validate(resetPasswordSchema, "body"), controller.resetPassword);
router.post("/logout", authenticate, controller.logout);
router.post("/logout-all", authenticate, controller.logoutAll);

export default router;