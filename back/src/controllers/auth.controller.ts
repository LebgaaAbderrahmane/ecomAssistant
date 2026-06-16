import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";

/**
 * GET CURRENT USER (placeholder)
 */
export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    res.json({
      name: "nedjar",
      firstname: "abdelmoumen",
    });
  } catch (err) {
    next(err);
  }
}

/**
 * SIGNUP
 */
export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password, shopName } = req.body;

    await authService.registerMerchant(email, password, shopName);

    return res.status(201).json({
      message:
        "Registration successful. Please check your email for the verification code.",
    });
  } catch (error: any) {
    if (error.message === "Email is already registered") {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

/**
 * VERIFY EMAIL (OTP VERSION)
 */
export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    // now coming from body, not query
    const { email, code } = req.body;

    const result = await authService.verifyEmail(email, code);

    return res.status(200).json(result);
  } catch (error: any) {
    const clientErrors = [
      "Verification code expired or invalid",
      "Invalid verification code",
      "Merchant not found",
      "Email already verified",
    ];

    if (clientErrors.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
};
