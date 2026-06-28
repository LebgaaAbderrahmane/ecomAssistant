import express, { Router } from "express";
import * as controller from "./auth.controller";
import { validate } from "../../middlwares/validation.middleware";
import { authenticate } from "../../middlwares/auth.middlware";
import { signupLimiter, loginLimiter, otpLimiter } from "../../middlwares/rateLimiter";
import {
  signupSchema,
  verifyEmailSchema,
  loginSchema,
  forgetPasswordSchema,
  resetPasswordSchema,
  refreshTokenSchema,
} from "../../validators/auth.validator";

const router: Router = express.Router();

router.get("/me", authenticate, controller.getMe);
router.post("/signup", signupLimiter, validate(signupSchema, "body"), controller.signup);
router.post("/verify-email", otpLimiter, validate(verifyEmailSchema, "body"), controller.verifyEmail);
router.post("/login", loginLimiter, validate(loginSchema, "body"), controller.login);
router.post("/refresh", validate(refreshTokenSchema, "body"), controller.refresh);
router.post("/forgot-password", otpLimiter, validate(forgetPasswordSchema, "body"), controller.forgetPassword);
router.post("/reset-password", otpLimiter, validate(resetPasswordSchema, "body"), controller.resetPassword);
router.post("/logout", authenticate, controller.logout);
router.post("/logout-all", authenticate, controller.logoutAll);

export default router;
