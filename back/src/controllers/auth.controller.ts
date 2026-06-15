import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";

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

export const signup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.body is already validated and typed by the validation middleware
    const { email, password, shopName } = req.body;

    await authService.registerMerchant(email, password, shopName);

    // Don't issue JWT yet — the merchant must verify their email first
    return res.status(201).json({
      message: "Registration successful. Please check your email to verify your account.",
    });
  } catch (error: any) {
    if (error.message === "Email is already registered") {
      return res.status(409).json({ message: error.message });
    }
    next(error);
  }
};

export const verifyEmail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // req.query is already validated by the validation middleware
    const { token } = req.query as { token: string };

    await authService.verifyEmail(token);

    return res.status(200).json({
      message: "Email verified successfully. You can now log in.",
    });
  } catch (error: any) {
    const clientErrors = [
      "Invalid verification token",
      "Email is already verified",
      "Verification token has expired",
    ];

    if (clientErrors.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
};