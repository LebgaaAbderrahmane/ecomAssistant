import express, { Router } from "express";
import { signup, verifyEmail, getMe } from "../controllers/auth.controller";
import { validate } from "../middlewares/validation.middleware";
import { signupSchema, verifyEmailSchema } from "../validators/auth.validator";

const router: Router = express.Router();

router.get("/me", getMe);
router.post("/signup", validate(signupSchema, "body"), signup);
router.post("/verify-email", validate(verifyEmailSchema, "body"), verifyEmail);

export default router;