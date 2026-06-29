import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config"
import crypto from "crypto";

const JWT_SECRET = config.JWT_SECRET;
const JWT_EXPIRES_IN = config.JWT_EXPIRES_IN;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET is not defined in environment variables");
}

if (!JWT_EXPIRES_IN) {
  throw new Error("JWT_EXPIRES_IN is not defined in environment variables");
}

interface TokenPayload {
  merchantId: string;
  email: string;
  jti: string;
}

export const generateToken = (payload: { merchantId: string; email: string }): string => {
  return jwt.sign(
    { ...payload, jti: crypto.randomUUID() },
    JWT_SECRET!,
    {
      expiresIn: JWT_EXPIRES_IN! as any,
      algorithm: "HS256",
    }
  );
};

export const verifyToken = (token: string): TokenPayload & { iat: number } => {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token");
  }

  if (!decoded.merchantId || !decoded.email || !decoded.jti || !decoded.iat) {
    throw new Error("Invalid token payload");
  }

  return {
    merchantId: decoded.merchantId as string,
    email: decoded.email as string,
    jti: decoded.jti as string,
    iat: decoded.iat as number,
  };
};


export const getMerchantIdFromToken = (authorization: string): string => {
  const token = authorization.replace(/^Bearer\s+/i, "");
  return verifyToken(token).merchantId;
};