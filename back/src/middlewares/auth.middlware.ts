import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";

export interface AuthenticatedRequest extends Request {
  merchant?: {
    merchantId: string;
    email: string;
  };
}

export const authenticate = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = req.cookies?.accessToken || (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : undefined);

    if (!token) {
      return res.status(401).json({ message: "Authorization token missing" });
    }

    const decoded = verifyToken(token);

    req.merchant = decoded;

    next();
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ message: "Access token expired" });
    }
    if (
      error.name === "JsonWebTokenError" ||
      error.message === "Invalid token" ||
      error.message === "Invalid token payload"
    ) {
      return res.status(401).json({ message: "Invalid access token" });
    }
    return res.status(401).json({ message: "Unauthorized" });
  }
};
