import rateLimit from "express-rate-limit";

const defaults = {
  standardHeaders: true,
  legacyHeaders: false,
};

export const signupLimiter = rateLimit({
  ...defaults,
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { message: "Trop de tentatives. Veuillez réessayer dans 15 minutes." },
});

export const loginLimiter = rateLimit({
  ...defaults,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Trop de tentatives. Veuillez réessayer dans 15 minutes." },
});

export const otpLimiter = rateLimit({
  ...defaults,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { message: "Trop de tentatives. Veuillez réessayer dans 15 minutes." },
});
