import prisma from "../../config/db.config";
import { redis } from "../../config";
import { generateToken } from "../../lib/jwt";
import { hashPassword, comparePassword } from "../../lib/crypto";
import { generateOTP, hashOTP, compareOTP } from "../../lib/otp";
import { emailQueue } from "../../queues/email.queue";
import crypto from "crypto";

const REFRESH_TOKEN_TTL = Number(process.env.REFRESH_TOKEN_TTL) || 60 * 60 * 24 * 30;

const storeRefreshToken = async (merchantId: string, email: string) => {
  const token = crypto.randomUUID();
  await redis.set(
    `refresh:${merchantId}:${token}`,
    JSON.stringify({ merchantId, email }),
    { EX: REFRESH_TOKEN_TTL }
  );
  return token;
};

export const registerMerchant = async (
  email: string,
  passwordPlain: string,
  shopName: string
) => {
  const existingMerchant = await prisma.merchant.findUnique({
    where: { email },
  });

  if (existingMerchant && existingMerchant.isVerified) {
    throw new Error("Email is already registered");
  }

  const passwordHash = await hashPassword(passwordPlain);

  let merchant;

  if (existingMerchant && !existingMerchant.isVerified) {
    merchant = await prisma.merchant.update({
      where: { email },
      data: {
        passwordHash,
        name: shopName,
        shopName,
      },
    });
  } else {
    merchant = await prisma.merchant.create({
      data: {
        email,
        passwordHash,
        name: shopName,
        shopName,
        isVerified: false,
      },
    });
  }

  const otp = generateOTP();
  console.log(`\n🔑 [DEV] OTP for ${email}: ${otp}\n`);
  const hashedOTP = await hashOTP(otp);

  await redis.set(`otp:${email}`, hashedOTP, { EX: 600 });

  await emailQueue.add("send-verification", {
    to: email,
    shopName,
    code: otp,
  });

  return merchant;
};

const OTP_MAX_ATTEMPTS = 5;
const OTP_LOCKOUT_MINUTES = 15;

async function checkOTPAttempts(email: string): Promise<void> {
  const attemptsKey = `otp-attempts:${email}`;
  const attempts = await redis.get(attemptsKey);
  const count = attempts ? parseInt(attempts, 10) : 0;

  if (count >= OTP_MAX_ATTEMPTS) {
    throw new Error("Trop de tentatives. Veuillez réessayer dans 15 minutes.");
  }
}

async function incrementOTPAttempts(email: string): Promise<void> {
  const attemptsKey = `otp-attempts:${email}`;
  await redis.incr(attemptsKey);
  await redis.expire(attemptsKey, OTP_LOCKOUT_MINUTES * 60);
}

async function clearOTPAttempts(email: string): Promise<void> {
  await redis.del(`otp-attempts:${email}`);
}

export const verifyEmail = async (email: string, code: string) => {
  const storedHash = await redis.get(`otp:${email}`);

  if (!storedHash) {
    await incrementOTPAttempts(email);
    throw new Error("Verification code expired or invalid");
  }

  const isValid = await compareOTP(code, storedHash);

  if (!isValid) {
    await checkOTPAttempts(email);
    await incrementOTPAttempts(email);
    throw new Error("Invalid verification code");
  }

  await clearOTPAttempts(email);

  const merchant = await prisma.merchant.findUnique({
    where: { email },
  });

  if (!merchant) {
    throw new Error("Merchant not found");
  }

  if (merchant.isVerified) {
    throw new Error("Email already verified");
  }

  const updatedMerchant = await prisma.merchant.update({
    where: { email },
    data: { isVerified: true },
  });

  await redis.del(`otp:${email}`);

  const accessToken = generateToken({
    merchantId: updatedMerchant.id,
    email: updatedMerchant.email,
  });
  const refreshToken = await storeRefreshToken(updatedMerchant.id, updatedMerchant.email);

  return {
    message: "Email verified successfully",
    accessToken,
    refreshToken,
    merchant: {
      id: updatedMerchant.id,
      email: updatedMerchant.email,
      name: updatedMerchant.name,
      shopName: updatedMerchant.shopName,
      isVerified: updatedMerchant.isVerified,
    },
  };
};

export const loginMerchant = async (email: string, password: string) => {
  const merchant = await prisma.merchant.findUnique({
    where: { email },
  });

  if (!merchant) {
    throw new Error("Invalid Email");
  }
  if (!merchant.isVerified) {
    throw new Error("Email address not yet registered");
  }

  const isPasswordValid = await comparePassword(password, merchant.passwordHash);

  if (!isPasswordValid) {
    throw new Error("Password Incorrect");
  }

  const accessToken = generateToken({
    merchantId: merchant.id,
    email: merchant.email,
  });
  const refreshToken = await storeRefreshToken(merchant.id, merchant.email);

  return {
    accessToken,
    refreshToken,
    merchant: {
      id: merchant.id,
      email: merchant.email,
      shopName: merchant.shopName,
    },
  };
};

export const refreshToken = async (merchantId: string, token: string) => {
  const key = `refresh:${merchantId}:${token}`;
  const storedPayload = await redis.get(key);

  if (!storedPayload) throw new Error("Refresh token expired or invalid");

  const { email } = JSON.parse(storedPayload);

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant || !merchant.isVerified) {
    await redis.del(key);
    throw new Error("Merchant not found or account unverified");
  }

  await redis.del(key);
  const newAccessToken = generateToken({ merchantId, email });
  const newRefreshToken = await storeRefreshToken(merchantId, email);

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

export const forgetPassword = async (email: string) => {
  const merchant = await prisma.merchant.findUnique({ where: { email } });

  if (!merchant || !merchant.isVerified) {
    throw new Error("Merchant not found or email not verified");
  }

  const otp = generateOTP();
  console.log(`\n🔑 [DEV] Reset OTP for ${email}: ${otp}\n`);
  const hashedOTP = await hashOTP(otp);

  await redis.set(`reset-otp:${email}`, hashedOTP, { EX: 600 });

  await emailQueue.add("send-reset-password", {
    to: email,
    shopName: merchant.shopName,
    code: otp,
  });

  return { message: "Password reset code sent successfully" };
};

export const resetPassword = async (
  email: string,
  code: string,
  newPasswordPlain: string
) => {
  const storedHash = await redis.get(`reset-otp:${email}`);

  if (!storedHash) {
    await incrementOTPAttempts(email);
    throw new Error("Reset code expired or invalid");
  }

  const isValid = await compareOTP(code, storedHash);
  if (!isValid) {
    await checkOTPAttempts(email);
    await incrementOTPAttempts(email);
    throw new Error("Invalid reset code");
  }

  await clearOTPAttempts(email);

  const newPasswordHash = await hashPassword(newPasswordPlain);

  await prisma.merchant.update({
    where: { email },
    data: { passwordHash: newPasswordHash },
  });

  await redis.del(`reset-otp:${email}`);

  const merchant = await prisma.merchant.findUnique({
    where: { email },
    select: { id: true },
  });
  if (merchant) {
    const sessionKeys = await redis.keys(`refresh:${merchant.id}:*`);
    if (sessionKeys.length > 0) {
      await redis.del(sessionKeys);
    }
  }

  return { message: "Password updated successfully. You can now log in." };
};

export const getMerchantProfile = async (merchantId: string) => {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
  });

  if (!merchant) throw new Error("Merchant not found");

  return {
    id: merchant.id,
    email: merchant.email,
    name: merchant.name,
    shopName: merchant.shopName,
    isVerified: merchant.isVerified,
  };
};

export const logoutMerchant = async (
  merchantId: string,
  refreshToken: string,
  jti: string
) => {
  await redis.del(`refresh:${merchantId}:${refreshToken}`);
  await redis.set(`jwt-blacklist:${jti}`, "1", { EX: 7 * 24 * 60 * 60 });
  return { message: "Logged out successfully" };
};

export const logoutAllDevices = async (merchantId: string) => {
  const keys = await redis.keys(`refresh:${merchantId}:*`);
  if (keys.length > 0) {
    await redis.del(keys);
  }
  await redis.set(
    `revoke-before:${merchantId}`,
    Math.floor(Date.now() / 1000).toString(),
    { EX: 7 * 24 * 60 * 60 }
  );
  return { message: "Logged out from all devices" };
};