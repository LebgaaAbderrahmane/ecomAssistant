import crypto from "crypto";

/**
 * Generates a cryptographically random token.
 * Returns the raw token (to be sent in the email) and its SHA-256 hash (to be stored in DB).
 */
export function generateVerificationToken(): { rawToken: string; hashedToken: string } {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = hashToken(rawToken);
  return { rawToken, hashedToken };
}

/**
 * Hashes a token using SHA-256.
 * Use this when verifying an incoming token from the URL.
 */
export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Returns a Date object representing the token expiry (default: 24 hours from now).
 */
export function getTokenExpiry(hoursFromNow = 24): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}