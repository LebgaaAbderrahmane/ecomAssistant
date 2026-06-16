import jwt, { JwtPayload } from "jsonwebtoken";
import { config } from "../config"


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
}

export const generateToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, JWT_SECRET!, {
    expiresIn: JWT_EXPIRES_IN! as any,
    algorithm: "HS256",
  });
};

export const verifyToken = (token: string): TokenPayload => {
  const decoded = jwt.verify(token, JWT_SECRET, {
    algorithms: ["HS256"],
  }) as JwtPayload;

  if (!decoded || typeof decoded !== "object") {
    throw new Error("Invalid token");
  }

  if (!decoded.merchantId || !decoded.email) {
    throw new Error("Invalid token payload");
  }

  return {
    merchantId: decoded.merchantId as string,
    email: decoded.email as string,
  };
};