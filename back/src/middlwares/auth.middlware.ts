import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt";
import { redis } from "../config";
import prisma from "../config/db.config";

export interface AuthenticatedRequest extends Request {
  merchant?: {
    merchantId: string;
    email: string;
    jti: string;
  };
}

export const authenticate = async (
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

    const blacklisted = await redis.get(`jwt-blacklist:${decoded.jti}`);
    if (blacklisted) {
      return res.status(401).json({ message: "Token revoked" });
    }

    const revokedBefore = await redis.get(`revoke-before:${decoded.merchantId}`);
    if (revokedBefore && decoded.iat <= parseInt(revokedBefore, 10)) {
      return res.status(401).json({ message: "Session revoked" });
    }

    const merchantExists = await prisma.merchant.findUnique({
      where: { id: decoded.merchantId },
      select: { id: true },
    });
    if (!merchantExists) {
      return res.status(401).json({ message: "Account not found" });
    }

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
