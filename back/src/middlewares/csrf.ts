import { Request, Response, NextFunction } from "express";

const SAFE_METHODS = ["GET", "HEAD", "OPTIONS"];

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.includes(req.method)) {
    return next();
  }

  // Exempt webhook endpoints — called by OpenWA, not the browser
  if (req.path.startsWith("/whatsapp/webhook")) {
    return next();
  }

  // Only protect routes that require authentication
  if (!req.cookies?.accessToken) {
    return next();
  }

  const cookieToken = req.cookies["csrf-token"];
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: "Invalid CSRF token" });
  }

  next();
};
