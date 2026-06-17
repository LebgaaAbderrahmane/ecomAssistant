import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service";
import { AuthenticatedRequest } from "../middlewares/auth.middlware";

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

export const signup = async (
  req: Request,
  res: Response,
  next: NextFunction
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

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
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

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, password } = req.body;
    const result = await authService.loginMerchant(email, password);

    return res.status(200).json({
      message: "Login successful",
      ...result,
    });
  } catch (error: any) {
    const clientErrors = [
      "Invalid Email",
      "Email address not yet registered",
      "Password Incorrect",
    ];

    if (clientErrors.includes(error.message)) {
      return res.status(401).json({ message: error.message });
    }
    next(error);
  }
};

export const refresh = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { merchantId, refreshToken } = req.body;

    const result = await authService.refreshToken(merchantId, refreshToken);

    return res.status(200).json(result);
  } catch (error: any) {
    if (error.message === "Refresh token expired or invalid") {
      return res.status(401).json({ message: error.message });
    }
    if (error.message === "Merchant not found or account unverified") {
      return res.status(403).json({ message: error.message });
    }
    next(error);
  }
};

export const logout = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const merchantId = req.merchant!.merchantId;
    const { refreshToken } = req.body;

    const result = await authService.logoutMerchant(merchantId, refreshToken);

    return res.status(200).json(result);
  } catch (error: any) {
    next(error);
  }
};

export const logoutAll = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const merchantId = req.merchant!.merchantId;

    const result = await authService.logoutAllDevices(merchantId);

    return res.status(200).json(result);
  } catch (error: any) {
    next(error);
  }
};

export const forgetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email } = req.body;

    const result = await authService.forgetPassword(email);

    return res.status(200).json(result);
  } catch (error: any) {
    if (error.message === "Merchant not found or email not verified") {
      return res.status(404).json({ message: error.message });
    }
    next(error);
  }
};

export const resetPassword = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { email, code, newPassword } = req.body;

    const result = await authService.resetPassword(email, code, newPassword);

    return res.status(200).json(result);
  } catch (error: any) {
    const clientErrors = [
      "Reset code expired or invalid",
      "Invalid reset code",
    ];

    if (clientErrors.includes(error.message)) {
      return res.status(400).json({ message: error.message });
    }

    next(error);
  }
};