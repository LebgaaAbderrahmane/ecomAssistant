import { Request, Response, NextFunction, type CookieOptions } from "express";
import * as authService from "../services/auth.service";
import { AuthenticatedRequest } from "../middlewares/auth.middlware";

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  path: "/",
};

function setAuthCookies(res: Response, accessToken: string, refreshToken: string) {
  res.cookie("accessToken", accessToken, COOKIE_OPTIONS);
  res.cookie("refreshToken", refreshToken, { ...COOKIE_OPTIONS, path: "/auth" });
}

function clearAuthCookies(res: Response) {
  res.clearCookie("accessToken", COOKIE_OPTIONS);
  res.clearCookie("refreshToken", { ...COOKIE_OPTIONS, path: "/auth" });
}

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

export const verifyEmail = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, code } = req.body;

    const result = await authService.verifyEmail(email, code);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.status(200).json({
      message: result.message,
      merchant: result.merchant,
    });
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

    setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.status(200).json({
      message: "Login successful",
      merchant: result.merchant,
    });
  } catch (error: any) {
    const clientErrors = [
      "Invalid Email",
      "Email address not yet registered",
      "Password Incorrect",
    ];

    if (clientErrors.includes(error.message)) {
      return res.status(401).json({
        message: error.message,
      });
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
    const { merchantId } = req.body;
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "Refresh token missing" });
    }

    const result = await authService.refreshToken(merchantId, refreshToken);

    setAuthCookies(res, result.accessToken, result.refreshToken);

    return res.status(200).json({ message: "Token refreshed" });
  } catch (error: any) {
    clearAuthCookies(res);
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
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await authService.logoutMerchant(merchantId, refreshToken);
    }

    clearAuthCookies(res);

    return res.status(200).json({ message: "Logged out successfully" });
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

    await authService.logoutAllDevices(merchantId);
    clearAuthCookies(res);

    return res.status(200).json({ message: "Logged out from all devices" });
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
