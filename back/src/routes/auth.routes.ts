import express, { Router } from "express";
import { signup, verifyEmail, getMe } from "../controllers/auth.controller";
import { validate } from "../middlewares/validation.middleware";
import { signupSchema, verifyEmailSchema } from "../validators/auth.validator";

const router: Router = express.Router();

router.get("/me", getMe);

// validate(schema, source) — "body" is default, "query" for URL params
router.post("/signup", validate(signupSchema, "body"), signup);
router.get("/verify-email", validate(verifyEmailSchema, "query"), verifyEmail);

export default router;