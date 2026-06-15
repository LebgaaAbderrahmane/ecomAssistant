import { hashPassword } from "../lib/crypto";
import { generateVerificationToken, hashToken, getTokenExpiry } from "../lib/token";
import { emailQueue } from "../queues/email.queue";
import prisma from "../config/db.config";

export const registerMerchant = async (
  email: string,
  passwordPlain: string,
  shopName: string
) => {
  // 1. Check if merchant already exists
  const existingMerchant = await prisma.merchant.findUnique({ where: { email } });
  if (existingMerchant) {
    throw new Error("Email is already registered");
  }

  // 2. Hash the password
  const passwordHash = await hashPassword(passwordPlain);

  // 3. Generate verification token
  const { rawToken, hashedToken } = generateVerificationToken();
  const tokenExpiry = getTokenExpiry(24); // 24 hours

  // 4. Create Merchant and Shop atomically
  const newMerchant = await prisma.merchant.create({
    data: {
      email,
      passwordHash,
      name: shopName,
      isVerified: false,
      verificationTokenHash: hashedToken,
      verificationTokenExpiresAt: tokenExpiry,
      shop: {
        create: { shopName },
      },
    },
    include: { shop: true },
  });

  // 5. Enqueue verification email (non-blocking — happens in background)
  const verificationUrl = `${process.env.APP_URL}/auth/verify-email?token=${rawToken}`;

  await emailQueue.add("send-verification-email", {
    to: email,
    shopName,
    verificationUrl,
  });

  return newMerchant;
};

export const verifyEmail = async (rawToken: string) => {
  // 1. Hash the incoming token to look it up in DB
  const hashedToken = hashToken(rawToken);

  // 2. Find merchant with this token
  const merchant = await prisma.merchant.findFirst({
    where: { verificationTokenHash: hashedToken },
  });

  if (!merchant) {
    throw new Error("Invalid verification token");
  }

  // 3. Check if already verified
  if (merchant.isVerified) {
    throw new Error("Email is already verified");
  }

  // 4. Check expiry
  if (!merchant.verificationTokenExpiresAt || merchant.verificationTokenExpiresAt < new Date()) {
    throw new Error("Verification token has expired");
  }

  // 5. Mark as verified and clear the token
  await prisma.merchant.update({
    where: { id: merchant.id },
    data: {
      isVerified: true,
      verificationTokenHash: null,
      verificationTokenExpiresAt: null,
    },
  });

  return merchant;
};